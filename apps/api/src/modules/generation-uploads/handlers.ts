import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db, transaction } from '../../../../../packages/database/src/index'
import { inspectInputImage } from '../../../../../packages/providers/src/index'
import { RUNTIME_SETTINGS_DEFAULTS } from '@musecanvas/contracts'
import type { Actor } from '../../auth/security'
import { fail, ok } from '../../shared/http'
import {
  createUploadPresignedPost,
  deleteS3Object,
  getPrivateS3ObjectBytes,
  signedAssetUrl,
} from '../../shared/services'
import { limited } from '../../shared/redis'
import {
  ALLOWED_MIME_TYPES,
  GENERATION_UPLOAD_SIGN_TTL_SECONDS,
  GENERATION_UPLOAD_TTL_SECONDS,
  GENERATION_UPLOAD_ID_PATTERN,
  MAX_ACTIVE_UPLOADS,
} from './constants'
import { resolveRuntimeSettings } from '../settings/runtime'

async function uploadRuntime(): Promise<{ maxImageBytes: number; maxTotalBytes: number; maxInputs: number; uploadTtlSeconds: number; signTtlSeconds: number }> {
  try {
    const runtime = await resolveRuntimeSettings()
    return { maxImageBytes: runtime.maxImageBytes, maxTotalBytes: runtime.maxTotalBytes, maxInputs: runtime.maxInputs, uploadTtlSeconds: runtime.uploadTtlSeconds, signTtlSeconds: runtime.signedUrlTtlSeconds }
  } catch {
    return {
      maxImageBytes: RUNTIME_SETTINGS_DEFAULTS.maxImageBytes,
      maxTotalBytes: RUNTIME_SETTINGS_DEFAULTS.maxTotalBytes,
      maxInputs: RUNTIME_SETTINGS_DEFAULTS.maxInputs,
      uploadTtlSeconds: GENERATION_UPLOAD_TTL_SECONDS,
      signTtlSeconds: GENERATION_UPLOAD_SIGN_TTL_SECONDS,
    }
  }
}

async function rejectUpload(uploadId: string, objectKey: string): Promise<void> {
  try {
    await deleteS3Object(objectKey)
  } catch {
    // The maintenance sweep retries after the upload authorization expires.
  }

  await db().query(
    `UPDATE generation_input_images
     SET status='deleted', deleted_at=COALESCE(deleted_at, now()), updated_at=now()
     WHERE id=$1`,
    [uploadId]
  )
  try {
    await db().query(
      `UPDATE media_uploads
       SET status='deleted', deleted_at=COALESCE(deleted_at, now()), updated_at=now()
       WHERE id=$1`,
      [uploadId]
    )
  } catch {
    // media_uploads table may not exist on older databases.
  }
}

export async function createGenerationUpload(
  actor: Actor,
  input: unknown
): Promise<NextResponse> {
  if (await limited(`upload:${actor.id}`, 60, 60)) {
    return fail('RATE_LIMITED', 'Too many upload requests. Please try again later.', 429)
  }

  if (!input || typeof input !== 'object') {
    return fail('INVALID_INPUT', 'Invalid request body format')
  }

  const payload = input as Record<string, unknown>
  const mimeType = payload.mimeType
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES[mimeType]) {
    return fail('INVALID_INPUT', 'Only PNG or JPEG images are supported')
  }

  const runtime = await uploadRuntime()
  const sizeBytes = Number(payload.sizeBytes)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > runtime.maxImageBytes) {
    return fail('INVALID_INPUT_IMAGE_SIZE', 'Image size exceeds the limit')
  }

  const id = randomUUID()
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'
  const objectKey = `inputs/${actor.id}/${id}.${ext}`
  const uploadTtlSeconds = runtime.uploadTtlSeconds
  const row = await transaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id])
    const activeUploads = await client.query(
      `SELECT count(*)::int AS count
       FROM generation_input_images
       WHERE created_by=$1 AND status IN ('pending', 'ready') AND deleted_at IS NULL AND expires_at > now()`,
      [actor.id]
    )
    if (Number(activeUploads.rows[0]?.count || 0) >= MAX_ACTIVE_UPLOADS) return null

    const result = await client.query(
      `INSERT INTO generation_input_images(id, created_by, status, object_key, mime_type, size_bytes, expires_at)
       VALUES($1, $2, 'pending', $3, $4, $5, now() + ($6 * interval '1 second'))
       RETURNING id, expires_at`,
      [id, actor.id, objectKey, mimeType, sizeBytes, uploadTtlSeconds]
    )
    // Mirror into generic media_uploads so role-aware video/image inputs share one source.
    try {
      await client.query(
        `INSERT INTO media_uploads(id, created_by, media_kind, status, object_key, mime_type, size_bytes, expires_at)
         VALUES($1, $2, 'image', 'pending', $3, $4, $5, now() + ($6 * interval '1 second')) ON CONFLICT (id) DO NOTHING`,
        [id, actor.id, objectKey, mimeType, sizeBytes, uploadTtlSeconds]
      )
    } catch {
      // media_uploads table may not exist on older databases; legacy table remains source of truth.
    }
    return result.rows[0]
  })
  if (!row) {
    return fail('UPLOAD_QUOTA_EXCEEDED', 'Too many pending reference images. Please remove some existing images first.', 429)
  }
  try {
    const presigned = await createUploadPresignedPost(
      objectKey,
      mimeType,
      sizeBytes,
      runtime.signTtlSeconds
    )
    return ok(
      {
        id: row.id as string,
        uploadUrl: presigned.url,
        fields: presigned.fields,
        expiresAt: new Date(row.expires_at as string | number | Date).toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('createUploadPresignedPost error', error)
    await db().query('DELETE FROM generation_input_images WHERE id=$1', [id]).catch(() => {})
    return fail('UPLOAD_SIGN_FAILED', 'Failed to generate an upload credential. Please try again later.', 503)
  }
}

export async function completeGenerationUpload(
  actor: Actor,
  uploadId: string
): Promise<NextResponse> {
  if (await limited(`upload-complete:${actor.id}`, 60, 60)) {
    return fail('RATE_LIMITED', 'Too many upload completion requests. Please try again later.', 429)
  }
  if (!GENERATION_UPLOAD_ID_PATTERN.test(uploadId)) {
    return fail('INVALID_INPUT', 'Invalid upload ID format')
  }

  const existing = await db().query(
    'SELECT * FROM generation_input_images WHERE id=$1 AND created_by=$2 AND deleted_at IS NULL',
    [uploadId, actor.id]
  )
  const upload = existing.rows[0]
  if (!upload) {
    return fail('NOT_FOUND', 'Upload record not found', 404)
  }

  if (upload.status === 'ready' || upload.status === 'attached') {
    return ok({
      id: upload.id as string,
      imageUrl: await signedAssetUrl(upload.object_key as string),
      mimeType: upload.mime_type as string,
      width: Number(upload.width || 0),
      height: Number(upload.height || 0),
      sizeBytes: Number(upload.size_bytes || 0),
    })
  }

  if (upload.status !== 'pending') {
    return fail('INVALID_STATE', 'Invalid upload record status', 409)
  }

  if (new Date(upload.expires_at as string | number | Date).getTime() <= Date.now()) {
    await rejectUpload(upload.id as string, upload.object_key as string)
    return fail('UPLOAD_EXPIRED', 'The upload credential has expired. Please select the image again.', 410)
  }

  const objectKey = upload.object_key as string
  let bytes: Buffer
  try {
    bytes = await getPrivateS3ObjectBytes(objectKey)
  } catch (error) {
    console.error('getPrivateS3ObjectBytes error', error)
    return fail('INPUT_IMAGE_UNAVAILABLE', 'Uploaded file not found. Please complete the direct upload first.', 400)
  }

  const declaredSize = Number(upload.size_bytes)
  const runtime = await uploadRuntime()
  if (bytes.length !== declaredSize || bytes.length > runtime.maxImageBytes) {
    await rejectUpload(upload.id as string, objectKey)
    return fail('INVALID_INPUT_IMAGE_SIZE', 'Uploaded file size does not match the declared size', 400)
  }

  let inspected: { width: number; height: number; mimeType: string; sizeBytes: number }
  try {
    inspected = inspectInputImage(bytes, { maxImageBytes: runtime.maxImageBytes })
  } catch (error) {
    await rejectUpload(upload.id as string, objectKey)
    const message = error instanceof Error ? error.message : 'INVALID_INPUT_IMAGE'
    const code = message === 'INVALID_INPUT_IMAGE_SIZE' ? 'INVALID_INPUT_IMAGE_SIZE' : 'INVALID_INPUT_IMAGE'
    return fail(code, 'The uploaded image is invalid or unsupported', 400)
  }

  if (inspected.mimeType !== upload.mime_type) {
    await rejectUpload(upload.id as string, objectKey)
    return fail('INVALID_INPUT_IMAGE', 'Uploaded file type does not match the declared type', 400)
  }

  const checksum = createHash('sha256').update(bytes).digest('hex')

  const updated = await db().query(
    `UPDATE generation_input_images
     SET status='ready', width=$1, height=$2, checksum=$3, updated_at=now()
     WHERE id=$4 AND created_by=$5 AND status='pending'
     RETURNING *`,
    [inspected.width, inspected.height, checksum, upload.id, actor.id]
  )
  try {
    await db().query(
      `UPDATE media_uploads
       SET status='ready', width=$1, height=$2, checksum=$3, updated_at=now()
       WHERE id=$4 AND created_by=$5 AND status='pending'`,
      [inspected.width, inspected.height, checksum, upload.id, actor.id]
    )
  } catch {
    // media_uploads table may not exist on older databases.
  }

  const finalRow = updated.rows[0] || (
    await db().query(
      'SELECT * FROM generation_input_images WHERE id=$1 AND created_by=$2',
      [upload.id, actor.id]
    )
  ).rows[0]
  if (
    !finalRow ||
    finalRow.deleted_at !== null ||
    !['ready', 'attached'].includes(finalRow.status as string)
  ) {
    return fail('INVALID_STATE', 'The upload record status has changed. Please select the image again.', 409)
  }
  return ok({
    id: finalRow.id as string,
    imageUrl: await signedAssetUrl(finalRow.object_key as string),
    mimeType: finalRow.mime_type as string,
    width: Number(finalRow.width || 0),
    height: Number(finalRow.height || 0),
    sizeBytes: Number(finalRow.size_bytes || 0),
  })
}

export async function deleteGenerationUpload(
  actor: Actor,
  uploadId: string
): Promise<NextResponse> {
  if (await limited(`upload-delete:${actor.id}`, 60, 60)) {
    return fail('RATE_LIMITED', 'Too many requests. Please try again later.', 429)
  }

  if (!GENERATION_UPLOAD_ID_PATTERN.test(uploadId)) {
    return fail('INVALID_INPUT', 'Invalid upload ID format')
  }

  const deleted = await db().query(
    `UPDATE generation_input_images
     SET status='deleted', deleted_at=now(), updated_at=now()
     WHERE id=$1 AND created_by=$2 AND status IN ('pending','ready') AND deleted_at IS NULL
     RETURNING id, object_key`,
    [uploadId, actor.id]
  )
  const upload = deleted.rows[0]
  if (!upload) {
    const state = await db().query(
      'SELECT status FROM generation_input_images WHERE id=$1 AND created_by=$2',
      [uploadId, actor.id]
    )
    if (state.rows[0]?.status === 'attached') {
      return fail('IMAGE_ATTACHED', 'The image is already attached to a generation task and cannot be deleted', 409)
    }
    return ok({ deleted: true })
  }
  try {
    await db().query(
      `UPDATE media_uploads
       SET status='deleted', deleted_at=now(), updated_at=now()
       WHERE id=$1 AND created_by=$2 AND status IN ('pending','ready') AND deleted_at IS NULL`,
      [uploadId, actor.id]
    )
  } catch {
    // media_uploads table may not exist on older databases.
  }
  try {
    await deleteS3Object(upload.object_key as string)
  } catch {
    // The maintenance sweep retries after the upload authorization expires.
  }

  return ok({ deleted: true })
}
