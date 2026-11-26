import { GENERATION_UPLOAD_ID_PATTERN, ALLOWED_MIME_TYPES, MAX_INPUT_IMAGES, MAX_UPLOAD_IMAGE_BYTES, MAX_UPLOAD_TOTAL_BYTES } from './constants'
import { MASK_INPUT_ROLE } from '@musecanvas/contracts'
import {
  MAX_INPUT_IMAGE_ASPECT_RATIO,
  MAX_INPUT_IMAGE_DIMENSION,
  MIN_INPUT_IMAGE_DIMENSION,
} from '../../../../../packages/providers/src/index'

export class GenerationInputError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'GenerationInputError'
    this.code = code
    this.status = status
  }
}
export type GenerationInputRole = 'prompt_image' | 'reference_image' | 'first_frame' | 'last_frame' | 'source_video' | string

export interface NormalizedGenerationInput {
  /** Set when the input is a locally uploaded file (`media_uploads` row). */
  uploadId?: string
  /**
   * Set when the input references an image that is already in the user's gallery
   * (`assets` row). No upload row and no second object are created for those — see
   * `validateAndAttachGenerationAssets`.
   */
  assetId?: string
  role: GenerationInputRole
  position: number
}

const KNOWN_INPUT_ROLES: Record<string, true> = {
  prompt_image: true,
  reference_image: true,
  first_frame: true,
  last_frame: true,
  source_video: true,
  // The 局部修改 mask. Only reachable when a model declares no slots at all (a
  // slot-bearing contract is gated by its own slots instead), but leaving it out
  // would make `packages/contracts`' `MASK_INPUT_ROLE` a lie about this list.
  [MASK_INPUT_ROLE]: true,
}

/**
 * Normalize the unified `inputs` payload (`[{uploadId | assetId, role, position}]`)
 * while accepting the legacy `inputImageIds` string array as a compatibility path.
 * Legacy ids are mapped to `reference_image` roles in array order.
 */
export function normalizeGenerationInputs(
  inputs: unknown,
  legacyInputImageIds?: unknown,
  fallbackRole = 'reference_image',
): NormalizedGenerationInput[] {
  if (inputs === undefined || inputs === null) {
    if (legacyInputImageIds === undefined || legacyInputImageIds === null) return []
    const legacyIds = validateInputImageIdsSyntax(legacyInputImageIds, Number.MAX_SAFE_INTEGER)
    return legacyIds.map((id, index) => ({ uploadId: id, role: fallbackRole, position: index }))
  }
  if (!Array.isArray(inputs)) {
    throw new GenerationInputError('INVALID_INPUT', 'inputs must be an array')
  }
  if (inputs.length > 32) {
    throw new GenerationInputError('INVALID_INPUT', 'Input count exceeds the limit')
  }
  const seen: Record<string, true> = {}
  const normalized: NormalizedGenerationInput[] = inputs.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new GenerationInputError('INVALID_INPUT', 'Invalid input item format')
    }
    const record = item as Record<string, unknown>
    // An input carries exactly one reference: an upload (bytes the browser streamed
    // into object storage, owned by this job) or a gallery asset (referenced in
    // place, reusable by later jobs). Both is ambiguous, neither is unfillable.
    const uploadId = typeof record.uploadId === 'string' ? record.uploadId.trim() : ''
    const assetId = typeof record.assetId === 'string' ? record.assetId.trim() : ''
    if (uploadId && assetId) {
      throw new GenerationInputError('INVALID_INPUT', 'An input cannot carry both uploadId and assetId')
    }
    if (!uploadId && !assetId) {
      throw new GenerationInputError('INVALID_INPUT', 'An input must provide uploadId or assetId')
    }
    const ref = uploadId || assetId
    // Both kinds are uuids (`gen_random_uuid()`), so one pattern covers them.
    if (!GENERATION_UPLOAD_ID_PATTERN.test(ref)) {
      throw new GenerationInputError('INVALID_INPUT', uploadId ? 'Invalid input uploadId format' : 'Invalid input assetId format')
    }
    // Kind-prefixed key: the same string used as an upload id and as an asset id
    // refers to two different images, so it is not a duplicate.
    const refKey = uploadId ? `u:${ref}` : `a:${ref}`
    if (seen[refKey]) {
      throw new GenerationInputError('INVALID_INPUT', uploadId ? 'Duplicate input uploadId' : 'Duplicate input assetId')
    }
    seen[refKey] = true
    const role = typeof record.role === 'string' && record.role.trim() ? record.role.trim() : fallbackRole
    const position = record.position === undefined || record.position === null ? index : Number(record.position)
    if (!Number.isInteger(position) || position < 0 || position >= 32) {
      throw new GenerationInputError('INVALID_INPUT', 'Invalid input position')
    }
    return { ...(uploadId ? { uploadId } : { assetId }), role, position }
  })
  normalized.sort((a, b) => a.position - b.position)
  return normalized
}

/**
 * Validate normalized inputs against a model's capability input slots.
 * Unknown roles are accepted only when the model declares no slots; otherwise
 * the role must match a declared slot and per-slot min/max counts apply.
 */
export function validateInputsAgainstSlots(
  normalized: NormalizedGenerationInput[],
  slots: { role: string; required?: boolean; minCount?: number; maxCount?: number }[],
  limits?: UploadAttachLimits,
): NormalizedGenerationInput[] {
  const maxInputs = limits?.maxInputs ?? MAX_INPUT_IMAGES
  if (normalized.length > maxInputs) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the limit')
  }
  if (!slots || slots.length === 0) {
    for (const item of normalized) {
      if (!KNOWN_INPUT_ROLES[item.role]) {
        throw new GenerationInputError('INVALID_INPUT', `Unsupported input role: ${item.role}`)
      }
    }
    return normalized
  }
  const byRole: Record<string, NormalizedGenerationInput[]> = {}
  for (const item of normalized) {
    byRole[item.role] = byRole[item.role] || []
    byRole[item.role].push(item)
  }
  for (const slot of slots) {
    const items = byRole[slot.role] || []
    const min = slot.minCount ?? (slot.required ? 1 : 0)
    const max = slot.maxCount ?? maxInputs
    if (items.length < min) {
      throw new GenerationInputError('INVALID_INPUT', `Missing required input: ${slot.role}`)
    }
    if (items.length > max) {
      throw new GenerationInputError('INVALID_INPUT', `Input ${slot.role} count exceeds the model limit`)
    }
    delete byRole[slot.role]
  }
  const leftovers = Object.keys(byRole)
  if (leftovers.length > 0) {
    throw new GenerationInputError('INVALID_INPUT', `The current model does not support input role(s): ${leftovers.join(',')}`)
  }
  return normalized
}


export function validateInputImageIdsSyntax(
  inputImageIds: unknown,
  modelMaxInputImages: number,
  limits?: UploadAttachLimits,
): string[] {
  if (inputImageIds === undefined || inputImageIds === null) return []
  if (!Array.isArray(inputImageIds)) {
    throw new GenerationInputError('INVALID_INPUT', 'inputImageIds must be an array')
  }
  if (inputImageIds.length === 0) return []
  const maxInputs = limits?.maxInputs ?? MAX_INPUT_IMAGES
  if (inputImageIds.length > maxInputs) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the limit')
  }
  if (modelMaxInputImages <= 0) {
    throw new GenerationInputError('MODEL_INPUT_IMAGES_NOT_SUPPORTED', 'The current model does not support reference image input', 400)
  }
  if (inputImageIds.length > modelMaxInputImages) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the model limit', 400)
  }

  const seen: Record<string, true> = {}
  for (const id of inputImageIds) {
    if (typeof id !== 'string' || !GENERATION_UPLOAD_ID_PATTERN.test(id)) {
      throw new GenerationInputError('INVALID_INPUT', 'Invalid reference image ID format')
    }
    if (seen[id]) {
      throw new GenerationInputError('INVALID_INPUT', 'Duplicate reference image ID')
    }
    seen[id] = true
  }

  return inputImageIds as string[]
}

export interface UploadAttachLimits {
  maxImageBytes?: number
  maxTotalBytes?: number
  maxInputs?: number
}

export async function validateAndAttachGenerationInputs(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  actorId: string,
  jobId: string,
  inputImageIds: string[],
  limits?: UploadAttachLimits,
): Promise<void> {
  const maxInputs = limits?.maxInputs ?? MAX_INPUT_IMAGES
  if (inputImageIds.length > maxInputs) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the limit')
  }

  const result = await client.query(
    `SELECT id, status, size_bytes, expires_at, deleted_at, attached_job_id
     FROM generation_input_images
     WHERE id = ANY($1) AND created_by = $2
     FOR UPDATE`,
    [inputImageIds, actorId]
  )

  if (result.rows.length !== inputImageIds.length) {
    throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image not found or inaccessible')
  }

  const rowsById: Record<string, Record<string, unknown>> = {}
  for (const row of result.rows) {
    rowsById[row.id as string] = row
  }

  let totalBytes = 0
  const now = Date.now()

  for (const id of inputImageIds) {
    const row = rowsById[id]
    if (!row || row.deleted_at !== null || row.status === 'deleted') {
      throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image has been deleted')
    }
    if (row.status !== 'ready') {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', 'Reference image is not ready')
    }
    if (row.attached_job_id !== null && row.attached_job_id !== undefined) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', 'Reference image is already used by another task')
    }
    const expiresAt = new Date(row.expires_at as string | number | Date).getTime()
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image has expired')
    }
    const sizeBytes = Number(row.size_bytes || 0)
    const maxSingle = limits?.maxImageBytes ?? MAX_UPLOAD_IMAGE_BYTES
    if (sizeBytes > maxSingle) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Reference image size exceeds the limit')
    }
    totalBytes += sizeBytes
  }
  if (totalBytes > (limits?.maxTotalBytes ?? MAX_UPLOAD_TOTAL_BYTES)) {
    throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Total reference image size exceeds the limit')
  }

  for (let i = 0; i < inputImageIds.length; i++) {
    const id = inputImageIds[i]
    await client.query(
      `INSERT INTO generation_job_inputs(job_id, input_image_id, position) VALUES($1, $2, $3)`,
      [jobId, id, i]
    )
    await client.query(
      `UPDATE generation_input_images SET status='attached', attached_job_id=$1, updated_at=now() WHERE id=$2`,
      [jobId, id]
    )
  }
}

/**
 * Role-aware generic attach against `media_uploads` (with legacy
 * `generation_input_images` fallback for rows created before the media_uploads
 * backfill). Persists `upload_id` + `role` linkage; keeps the legacy
 * `input_image_id` column populated for image uploads so older readers keep
 * working. Never stores provider secrets or signed URLs.
 *
 * Asset-referenced inputs are ignored here (they have no upload row) and handled by
 * `validateAndAttachGenerationAssets`. Returns the bytes this branch counted, so the
 * caller can enforce one pooled total across both kinds.
 */
export async function validateAndAttachGenerationUploads(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  actorId: string,
  jobId: string,
  normalized: NormalizedGenerationInput[],
  limits?: UploadAttachLimits,
): Promise<number> {
  const maxInputs = limits?.maxInputs ?? MAX_INPUT_IMAGES
  if (normalized.length > maxInputs) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the limit')
  }
  const items = normalized.filter((item): item is NormalizedGenerationInput & { uploadId: string } =>
    Boolean(item.uploadId),
  )
  // A gallery-only request must never reach `= ANY($1)` with an empty array: pg
  // cannot infer the element type of `{}` and errors out instead of matching nothing.
  if (items.length === 0) return 0
  const ids = items.map(item => item.uploadId)
  let rows: Record<string, unknown>[] = []
  try {
    const result = await client.query(
      `SELECT id, status, size_bytes, expires_at, deleted_at, attached_job_id, media_kind
       FROM media_uploads
       WHERE id = ANY($1) AND created_by = $2
       FOR UPDATE`,
      [ids, actorId],
    )
    rows = result.rows
  } catch {
    rows = []
  }
  if (rows.length !== ids.length) {
    const found: Record<string, true> = {}
    for (const row of rows) found[String(row.id)] = true
    const missing = ids.filter(id => !found[id])
    const fallback = await client.query(
      `SELECT id, status, size_bytes, expires_at, deleted_at, attached_job_id
       FROM generation_input_images
       WHERE id = ANY($1) AND created_by = $2
       FOR UPDATE`,
      [missing, actorId],
    )
    rows = [...rows, ...fallback.rows.map(row => ({ ...row, media_kind: 'image' }))]
  }
  if (rows.length !== ids.length) {
    throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image not found or inaccessible')
  }
  const rowsById: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    rowsById[row.id as string] = row
  }
  let totalBytes = 0
  const now = Date.now()
  for (const item of items) {
    const row = rowsById[item.uploadId]
    if (!row || row.deleted_at !== null || row.status === 'deleted') {
      throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image has been deleted')
    }
    if (row.status !== 'ready') {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', 'Reference image is not ready')
    }
    if (row.attached_job_id !== null && row.attached_job_id !== undefined) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', 'Reference image is already used by another task')
    }
    const expiresAt = new Date(row.expires_at as string | number | Date).getTime()
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image has expired')
    }
    const sizeBytes = Number(row.size_bytes || 0)
    const maxSingle = limits?.maxImageBytes ?? MAX_UPLOAD_IMAGE_BYTES
    if (sizeBytes > maxSingle) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Reference image size exceeds the limit')
    }
    totalBytes += sizeBytes
  }
  if (totalBytes > (limits?.maxTotalBytes ?? MAX_UPLOAD_TOTAL_BYTES)) {
    throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Total reference image size exceeds the limit')
  }
  for (const item of items) {
    const mediaKind = String(rowsById[item.uploadId]?.media_kind || 'image')
    await client.query(
      `INSERT INTO generation_job_inputs(job_id, input_image_id, upload_id, position, role) VALUES($1, $2, $3, $4, $5)`,
      [jobId, mediaKind === 'image' ? item.uploadId : null, item.uploadId, item.position, item.role],
    )
    try {
      await client.query(
        `UPDATE media_uploads SET status='attached', attached_job_id=$1, updated_at=now() WHERE id=$2`,
        [jobId, item.uploadId],
      )
    } catch {
      // media_uploads table may not exist on older databases; legacy update below covers it.
    }
    if (mediaKind === 'image') {
      await client.query(
        `UPDATE generation_input_images SET status='attached', attached_job_id=$1, updated_at=now() WHERE id=$2`,
        [jobId, item.uploadId],
      )
    }
  }
  return totalBytes
}

/**
 * Attach inputs that reference an image already in the user's gallery.
 *
 * These rows store only `asset_id`: no `media_uploads` row, no second object, and no
 * `attached_job_id` claim — a gallery image is not consumed by being used, so the
 * same one may feed any number of later jobs. That is also what keeps
 * `deleteGenerationUpload` and the worker's upload TTL / orphan sweeps (which act on
 * `media_uploads` and `generation_input_images` object keys) structurally unable to
 * reach a gallery object.
 *
 * Deliberately no `FOR UPDATE` on `assets`: nothing here writes to that table, so
 * there is no write skew to guard, while a row lock would serialize every job that
 * reuses a popular image and invert the lock order against account deletion
 * (which updates `assets` before touching `generation_job_inputs`). The race that
 * remains — the user deletes the image after this check but before the worker reads
 * it — resolves in the worker as a retryable `INPUT_IMAGE_UNAVAILABLE`.
 *
 * @param usedBytes bytes already counted by the upload branch, so a single pooled
 *                  total-size cap applies across both kinds.
 * @returns the bytes this branch counted.
 */
export async function validateAndAttachGenerationAssets(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  actorId: string,
  jobId: string,
  normalized: NormalizedGenerationInput[],
  limits?: UploadAttachLimits,
  usedBytes = 0,
): Promise<number> {
  const maxInputs = limits?.maxInputs ?? MAX_INPUT_IMAGES
  if (normalized.length > maxInputs) {
    throw new GenerationInputError('INVALID_INPUT', 'Reference image count exceeds the limit')
  }
  const items = normalized.filter((item): item is NormalizedGenerationInput & { assetId: string } =>
    Boolean(item.assetId),
  )
  if (items.length === 0) return 0

  const ids = items.map(item => item.assetId)
  // Ownership is exactly this predicate — the same `created_by` rule the library list
  // uses, so the picker can never hand out another user's image.
  const result = await client.query(
    `SELECT id, media_kind, mime_type, width, height, size_bytes
     FROM assets
     WHERE id = ANY($1::uuid[]) AND created_by = $2 AND deleted_at IS NULL`,
    [ids, actorId],
  )
  if (result.rows.length !== ids.length) {
    throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image not found or inaccessible')
  }
  const rowsById: Record<string, Record<string, unknown>> = {}
  for (const row of result.rows) {
    rowsById[row.id as string] = row
  }

  const maxSingle = limits?.maxImageBytes ?? MAX_UPLOAD_IMAGE_BYTES
  const maxTotal = limits?.maxTotalBytes ?? MAX_UPLOAD_TOTAL_BYTES
  let totalBytes = usedBytes
  for (const item of items) {
    const row = rowsById[item.assetId]
    if (!row) {
      throw new GenerationInputError('INPUT_IMAGE_UNAVAILABLE', 'Reference image not found or inaccessible')
    }
    // Only PNG/JPEG bytes survive `inspectImageBytes` in the worker, so a WebP
    // artifact (or a video poster) is rejected here with a readable message instead
    // of failing the job minutes later.
    if (String(row.media_kind || 'image') !== 'image' || !ALLOWED_MIME_TYPES[String(row.mime_type)]) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', 'Library artwork format is not supported as a reference image; only PNG or JPEG images are supported')
    }
    // Same geometry gate the worker applies to the bytes it loads.
    const width = Number(row.width || 0)
    const height = Number(row.height || 0)
    if (
      width < MIN_INPUT_IMAGE_DIMENSION ||
      width > MAX_INPUT_IMAGE_DIMENSION ||
      height < MIN_INPUT_IMAGE_DIMENSION ||
      height > MAX_INPUT_IMAGE_DIMENSION
    ) {
      throw new GenerationInputError(
        'INVALID_INPUT_IMAGE',
        `Reference image resolution must be between ${MIN_INPUT_IMAGE_DIMENSION} and ${MAX_INPUT_IMAGE_DIMENSION} pixels`,
      )
    }
    const aspectRatio = Math.max(width / height, height / width)
    if (aspectRatio > MAX_INPUT_IMAGE_ASPECT_RATIO) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE', `Reference image aspect ratio cannot exceed ${MAX_INPUT_IMAGE_ASPECT_RATIO}:1`)
    }
    const sizeBytes = Number(row.size_bytes || 0)
    if (sizeBytes > maxSingle) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Reference image size exceeds the limit')
    }
    totalBytes += sizeBytes
    if (totalBytes > maxTotal) {
      throw new GenerationInputError('INVALID_INPUT_IMAGE_SIZE', 'Total reference image size exceeds the limit')
    }
  }

  for (const item of items) {
    // `input_image_id` must stay NULL: it is UNIQUE and references
    // `generation_input_images`, which asset-sourced inputs never occupy.
    await client.query(
      `INSERT INTO generation_job_inputs(job_id, input_image_id, upload_id, asset_id, position, role) VALUES($1, NULL, NULL, $2, $3, $4)`,
      [jobId, item.assetId, item.position, item.role],
    )
  }
  return totalBytes - usedBytes
}

/**
 * Attach a normalized input list of mixed provenance. Uploads are validated and
 * claimed first; gallery assets then consume whatever is left of the pooled
 * total-size budget.
 */
export async function attachGenerationInputs(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  actorId: string,
  jobId: string,
  normalized: NormalizedGenerationInput[],
  limits?: UploadAttachLimits,
): Promise<void> {
  const usedByUploads = await validateAndAttachGenerationUploads(client, actorId, jobId, normalized, limits)
  await validateAndAttachGenerationAssets(client, actorId, jobId, normalized, limits, usedByUploads)
}
