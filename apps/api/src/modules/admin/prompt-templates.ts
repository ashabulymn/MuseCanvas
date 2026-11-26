import { NextResponse } from 'next/server'
import {
  db,
  transaction,
  activatePromptTemplateSet as activatePromptTemplateSetTx,
  createPromptTemplateEntry as createPromptTemplateEntryTx,
  createPromptTemplateSetWithEntries,
  deletePromptTemplateEntry as deletePromptTemplateEntryTx,
  deletePromptTemplateSet as deletePromptTemplateSetTx,
  getActivePromptTemplateSetWithEntries,
  getPromptTemplateSetWithEntries,
  listPromptTemplateSets as listPromptTemplateSetRows,
  updatePromptTemplateEntry as updatePromptTemplateEntryTx,
  PROMPT_TEMPLATE_MAX_SORT_ORDER,
  type PromptTemplateSetWithEntries,
} from '../../../../../packages/database/src/index'
import {
  PROMPT_TEMPLATE_VAR_LOOKUP,
  type ImportPromptTemplateSetResult,
  type PromptTemplateEntryDto,
  type PromptTemplateSetDetailDto,
  type PromptTemplateSetSummaryDto,
  type RenderPromptTemplateResult,
} from '@musecanvas/contracts'
import type { PromptTemplateEntryEntity, PromptTemplateSetEntity } from '../../../../../packages/database/src/index'
import type { Actor } from '../../auth/security'
import { fail, ok } from '../../shared/http'

export const PROMPT_TEMPLATE_MAX_ENTRIES = 100
export const PROMPT_TEMPLATE_MAX_INSTRUCTION_BYTES = 128 * 1024
export const PROMPT_TEMPLATE_MAX_NAME_LENGTH = 120
export const PROMPT_TEMPLATE_MAX_DESCRIPTION_LENGTH = 1000

const ALLOWED_VARS: Readonly<Record<string, true>> = PROMPT_TEMPLATE_VAR_LOOKUP
const NUL = '\0'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isPromptTemplateSetId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value)

// ---------------------------------------------------------------------------
// Pure validation + rendering helpers (no I/O; covered by backend tests)
// ---------------------------------------------------------------------------

export function extractPromptTemplateVariables(instruction: string): string[] {
  return [...instruction.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => (match[1] ?? '').trim())
}

export function hasStrayPromptTemplateBraces(instruction: string): boolean {
  return /{{|}}/.test(instruction.replace(/{{\s*([^{}]+?)\s*}}/g, ''))
}

export type PromptTemplateValidationError = { code: string; message: string }

export function validatePromptTemplateName(raw: unknown): { name: string } | PromptTemplateValidationError {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { code: 'TEMPLATE_NAME_EMPTY', message: 'Template name cannot be empty' }
  }
  const name = raw.trim()
  if (name.length > PROMPT_TEMPLATE_MAX_NAME_LENGTH) {
    return { code: 'INVALID_INPUT', message: 'Template name cannot exceed 120 characters' }
  }
  if (name.includes(NUL)) return { code: 'INVALID_INPUT', message: 'Template name contains illegal characters' }
  return { name }
}

export function validatePromptTemplateDescription(
  raw: unknown,
): { description: string } | PromptTemplateValidationError {
  if (raw === undefined || raw === null) return { description: '' }
  if (typeof raw !== 'string') return { code: 'INVALID_INPUT', message: 'Invalid template description' }
  const description = raw.trim()
  if (description.length > PROMPT_TEMPLATE_MAX_DESCRIPTION_LENGTH) {
    return { code: 'INVALID_INPUT', message: 'Template description cannot exceed 1000 characters' }
  }
  if (description.includes(NUL)) return { code: 'INVALID_INPUT', message: 'Template description contains illegal characters' }
  return { description }
}

export function validatePromptTemplateInstruction(
  raw: unknown,
): { instruction: string } | PromptTemplateValidationError {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { code: 'TEMPLATE_INSTRUCTION_EMPTY', message: 'Template content cannot be empty' }
  }
  if (raw.includes(NUL)) return { code: 'INVALID_INPUT', message: 'Template content contains illegal characters' }
  if (Buffer.byteLength(raw, 'utf8') > PROMPT_TEMPLATE_MAX_INSTRUCTION_BYTES) {
    return { code: 'INVALID_INPUT', message: 'Template content exceeds the 128KB limit' }
  }
  const variables = extractPromptTemplateVariables(raw)
  if (variables.some((variable) => ALLOWED_VARS[variable] !== true)) {
    return { code: 'INVALID_TEMPLATE_VARIABLE', message: 'Template contains unsupported variables' }
  }
  if (hasStrayPromptTemplateBraces(raw)) {
    return { code: 'INVALID_INPUT', message: 'Template has unclosed braces' }
  }
  return { instruction: raw }
}

export function validatePromptTemplateSortOrder(
  raw: unknown,
): { sortOrder: number | undefined } | PromptTemplateValidationError {
  if (raw === undefined || raw === null) return { sortOrder: undefined }
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > PROMPT_TEMPLATE_MAX_SORT_ORDER) {
    return { code: 'INVALID_INPUT', message: 'Sort value must be an integer between 0 and 1000000' }
  }
  return { sortOrder: parsed }
}

export interface ValidatedPromptTemplateItem {
  name: string
  description: string
  instruction: string
  path?: string
  sortOrder?: number
}

function isValidationError(value: unknown): value is PromptTemplateValidationError {
  if (typeof value !== 'object' || value === null) return false
  if (!('code' in value) || !('message' in value)) return false
  return typeof value.code === 'string' && typeof value.message === 'string'
}
export function asValidationError(value: unknown): PromptTemplateValidationError | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('code' in value) || !('message' in value)) return null
  if (typeof value.code !== 'string' || typeof value.message !== 'string') return null
  return { code: value.code, message: value.message }
}
function asInputRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  // Boundary value: narrowed to a non-array object; each field is validated per use.
  const record: Record<string, unknown> = value as Record<string, unknown>
  return record
}
function validatePromptTemplatePath(raw: unknown): { path: string | undefined } | PromptTemplateValidationError {
  if (raw === undefined || raw === null) return { path: undefined }
  if (typeof raw !== 'string' || !raw.trim()) return { code: 'INVALID_INPUT', message: 'Invalid template path' }
  const path = raw.trim()
  if (path.includes(NUL) || path.length > 500) {
    return { code: 'INVALID_INPUT', message: 'Invalid template path' }
  }
  return { path }
}

function validateTemplateItem(
  item: unknown,
  index: number,
): { entry: ValidatedPromptTemplateItem } | PromptTemplateValidationError {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { code: 'INVALID_INPUT', message: 'Invalid template entry' }
  }
  // Boundary object: narrowed to a non-array object above; each field is validated below.
  const record: Record<string, unknown> = item as Record<string, unknown>
  const name = validatePromptTemplateName(record.name)
  if (isValidationError(name)) return name
  const description = validatePromptTemplateDescription(record.description)
  if (isValidationError(description)) return description
  const instruction = validatePromptTemplateInstruction(record.instruction ?? record.content)
  if (isValidationError(instruction)) return instruction
  const sortOrder = validatePromptTemplateSortOrder(record.sortOrder)
  if (isValidationError(sortOrder)) return sortOrder
  const path = validatePromptTemplatePath(record.path)
  if (isValidationError(path)) return path
  return {
    entry: {
      name: name.name,
      description: description.description,
      instruction: instruction.instruction,
      ...(path.path !== undefined ? { path: path.path } : {}),
      ...(sortOrder.sortOrder !== undefined ? { sortOrder: sortOrder.sortOrder } : { sortOrder: index }),
    },
  }
}

export interface ValidatedImportInput {
  name: string
  activate: boolean
  templates: ValidatedPromptTemplateItem[]
}

export function validatePromptTemplateImport(
  input: unknown,
): { input: ValidatedImportInput } | PromptTemplateValidationError {
  const record = asInputRecord(input)
  if (!record) return { code: 'INVALID_INPUT', message: 'Invalid template list' }
  const raw = record.templates ?? record.entries
  if (!Array.isArray(raw)) return { code: 'INVALID_INPUT', message: 'Invalid template list' }
  if (raw.length === 0 || raw.length > PROMPT_TEMPLATE_MAX_ENTRIES) {
    return { code: 'INVALID_INPUT', message: 'Template count must be between 1 and 100' }
  }
  const nameRaw = record.name
  let name = 'default'
  if (nameRaw !== undefined && nameRaw !== null && String(nameRaw).trim()) {
    const parsed = validatePromptTemplateName(nameRaw)
    if (isValidationError(parsed)) return parsed
    name = parsed.name
  }
  if (record.activate !== undefined && typeof record.activate !== 'boolean') {
    return { code: 'INVALID_INPUT', message: 'activate must be a boolean' }
  }
  const activate = record.activate === undefined ? true : record.activate === true
  const names = new Set<string>()
  const templates: ValidatedPromptTemplateItem[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const validated = validateTemplateItem(raw[index], index)
    if (isValidationError(validated)) return validated
    if (names.has(validated.entry.name)) {
      return { code: 'DUPLICATE_TEMPLATE_NAME', message: 'Template names must be unique' }
    }
    names.add(validated.entry.name)
    templates.push(validated.entry)
  }
  return { input: { name, activate, templates } }
}

export function validatePromptTemplateEntryCreate(
  input: unknown,
): { entry: ValidatedPromptTemplateItem } | PromptTemplateValidationError {
  const validated = validateTemplateItem(input, 0)
  if (isValidationError(validated)) return validated
  return {
    entry: {
      name: validated.entry.name,
      description: validated.entry.description,
      instruction: validated.entry.instruction,
      sortOrder: validated.entry.sortOrder,
    },
  }
}

export interface ValidatedEntryPatch {
  name?: string
  description?: string
  instruction?: string
  sortOrder?: number
}

export function validatePromptTemplateEntryPatch(
  input: unknown,
): { patch: ValidatedEntryPatch } | PromptTemplateValidationError {
  const record = asInputRecord(input)
  if (!record) return { code: 'INVALID_INPUT', message: 'Invalid template update content' }
  const patch: ValidatedEntryPatch = {}
  if (record.name !== undefined) {
    const name = validatePromptTemplateName(record.name)
    if (isValidationError(name)) return name
    patch.name = name.name
  }
  if (record.description !== undefined) {
    const description = validatePromptTemplateDescription(record.description)
    if (isValidationError(description)) return description
    patch.description = description.description
  }
  if (record.instruction !== undefined) {
    const instruction = validatePromptTemplateInstruction(record.instruction)
    if (isValidationError(instruction)) return instruction
    patch.instruction = instruction.instruction
  }
  if (record.sortOrder !== undefined) {
    const sortOrder = validatePromptTemplateSortOrder(record.sortOrder)
    if (isValidationError(sortOrder)) return sortOrder
    if (sortOrder.sortOrder !== undefined) patch.sortOrder = sortOrder.sortOrder
  }
  if (Object.keys(patch).length === 0) {
    return { code: 'INVALID_INPUT', message: 'Template update content cannot be empty' }
  }
  return { patch }
}

export function renderPromptTemplatePreview(
  instruction: string,
  values: Record<string, string | number> = {},
): RenderPromptTemplateResult {
  const usedVariables = [...new Set(extractPromptTemplateVariables(instruction))]
  const rendered = instruction.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, variable: string) => {
    const key = String(variable).trim()
    const value: string | number | undefined = values[key]
    if (value === undefined || value === null) return ''
    return String(value)
  })
  return {
    rendered,
    usedVariables,
    hasUnresolvedVariables: usedVariables.some((variable) => values[variable] === undefined),
  }
}

export function validatePromptTemplatePreview(
  input: unknown,
): { preview: RenderPromptTemplateResult } | PromptTemplateValidationError {
  const record = asInputRecord(input)
  if (!record) return { code: 'INVALID_INPUT', message: 'Invalid preview request' }
  const instruction = validatePromptTemplateInstruction(record.instruction)
  if (isValidationError(instruction)) return instruction
  const rawValues = record.values
  const values: Record<string, string | number> = {}
  if (rawValues !== undefined && rawValues !== null) {
    if (typeof rawValues !== 'object' || Array.isArray(rawValues)) {
      return { code: 'INVALID_INPUT', message: 'Invalid preview variables' }
    }
    // Boundary object: narrowed to a non-array object above; keys and values are validated per entry.
    const valueEntries: Array<[string, unknown]> = Object.entries(rawValues as Record<string, unknown>)
    for (const [key, value] of valueEntries) {
      if (ALLOWED_VARS[key] !== true) {
        return { code: 'INVALID_TEMPLATE_VARIABLE', message: 'Unsupported preview variable: ' + key }
      }
      if (typeof value !== 'string' && typeof value !== 'number') {
        return { code: 'INVALID_INPUT', message: 'Preview variable values must be strings or numbers' }
      }
      values[key] = value
    }
  }
  return { preview: renderPromptTemplatePreview(instruction.instruction, values) }
}

// ---------------------------------------------------------------------------
// DTO conversion (summaries never carry instructions or resolved paths)
// ---------------------------------------------------------------------------

export function toPromptTemplateEntryDto(entry: PromptTemplateEntryEntity): PromptTemplateEntryDto {
  return {
    id: entry.id,
    setId: entry.setId,
    name: entry.name,
    description: entry.description,
    ...(entry.path ? { path: entry.path } : {}),
    instruction: entry.instruction ?? '',
    ...(entry.contentSha256 ? { contentSha256: entry.contentSha256 } : {}),
    sortOrder: entry.sortOrder,
    createdAt: entry.createdAt,
  }
}

export function toPromptTemplateSetSummaryDto(set: PromptTemplateSetEntity): PromptTemplateSetSummaryDto {
  return {
    id: set.id,
    name: set.name,
    version: set.version,
    isActive: set.isActive,
    entryCount: set.entryCount,
    contentDigest: set.contentDigest,
    createdBy: set.createdBy ?? null,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
  }
}

export function toPromptTemplateSetDetailDto(set: PromptTemplateSetWithEntries): PromptTemplateSetDetailDto {
  return {
    ...toPromptTemplateSetSummaryDto(set),
    entries: set.entries.map(toPromptTemplateEntryDto),
  }
}

export interface PromptTemplateExportPayload {
  name: string
  version: number
  templates: Array<{
    name: string
    description: string
    instruction: string
    path?: string
    sortOrder: number
  }>
}

export function buildPromptTemplateExportPayload(set: PromptTemplateSetWithEntries): PromptTemplateExportPayload {
  return {
    name: set.name,
    version: set.version,
    templates: set.entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      instruction: entry.instruction ?? '',
      ...(entry.path ? { path: entry.path } : {}),
      sortOrder: entry.sortOrder,
    })),
  }
}

export function promptTemplateExportFilename(name: string, version: number): string {
  const safe =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'templates'
  return 'prompt-templates-' + safe + '-v' + version + '.json'
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function repoErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof Error) {
    switch (error.message) {
      case 'TEMPLATE_SET_NOT_FOUND':
        return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
      case 'TEMPLATE_ENTRY_NOT_FOUND':
        return fail('TEMPLATE_ENTRY_NOT_FOUND', 'Template not found', 404)
      case 'CANNOT_DELETE_ACTIVE_SET':
        return fail('CANNOT_DELETE_ACTIVE_SET', 'An active template set cannot be deleted', 409)
      case 'DUPLICATE_TEMPLATE_NAME':
        return fail('DUPLICATE_TEMPLATE_NAME', 'Template names must be unique', 409)
      case 'TEMPLATE_SET_NOT_ACTIVE':
        return fail('TEMPLATE_SET_NOT_ACTIVE', 'Only an active template set can be edited', 409)
      case 'INVALID_TEMPLATE_VARIABLE':
        return fail('INVALID_TEMPLATE_VARIABLE', 'Template contains unsupported variables', 400)
      case 'TEMPLATE_INSTRUCTION_EMPTY':
        return fail('TEMPLATE_INSTRUCTION_EMPTY', 'Template content cannot be empty', 400)
      case 'TEMPLATE_NAME_EMPTY':
        return fail('TEMPLATE_NAME_EMPTY', 'Template name cannot be empty', 400)
      case 'NO_ACTIVE_TEMPLATE_SET':
        return fail('NO_ACTIVE_TEMPLATE_SET', 'No template set is currently active', 404)
      case 'INVALID_INPUT':
        return fail('INVALID_INPUT', 'Invalid template data', 400)
      default:
        break
    }
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return fail('DUPLICATE_TEMPLATE_NAME', 'Template names must be unique', 409)
  }
  return null
}

function validationToResponse(error: PromptTemplateValidationError): NextResponse {
  const status =
    error.code === 'TEMPLATE_SET_NOT_FOUND' ||
    error.code === 'TEMPLATE_ENTRY_NOT_FOUND' ||
    error.code === 'NO_ACTIVE_TEMPLATE_SET'
      ? 404
      : error.code === 'DUPLICATE_TEMPLATE_NAME' || error.code === 'CANNOT_DELETE_ACTIVE_SET' || error.code === 'TEMPLATE_SET_NOT_ACTIVE'
        ? 409
        : 400
  return fail(error.code, error.message, status)
}

const auditTemplate = (
  client: { query: (sql: string, params: unknown[]) => Promise<unknown> },
  actor: Actor,
  action: string,
  targetId: string,
  summary: Record<string, unknown> = {},
) =>
  client.query(
    'INSERT INTO audit_logs(actor_id,action,target_type,target_id,summary) VALUES($1,$2,$3,$4,$5)',
    [actor.id, action, 'prompt_template_set', targetId, summary],
  )

// ---------------------------------------------------------------------------
// Handlers (all mutations run inside `transaction` with audit records)
// ---------------------------------------------------------------------------

export async function getAdminPromptTemplates(): Promise<NextResponse> {
  const set = await getActivePromptTemplateSetWithEntries(db())
  if (!set) return ok(null)
  return ok(toPromptTemplateSetDetailDto(set))
}

export async function listPromptTemplateSets(): Promise<NextResponse> {
  const sets = await listPromptTemplateSetRows(db())
  return ok(sets.map(toPromptTemplateSetSummaryDto))
}

export async function getPromptTemplateSetDetail(setId: string): Promise<NextResponse> {
  if (!isPromptTemplateSetId(setId)) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  const set = await getPromptTemplateSetWithEntries(db(), setId)
  if (!set) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  return ok(toPromptTemplateSetDetailDto(set))
}

export async function exportPromptTemplates(setId?: string): Promise<NextResponse> {
  let set: PromptTemplateSetWithEntries | null = null
  if (setId) {
    if (!isPromptTemplateSetId(setId)) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
    set = await getPromptTemplateSetWithEntries(db(), setId)
    if (!set) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  } else {
    set = await getActivePromptTemplateSetWithEntries(db())
    if (!set) return fail('NO_ACTIVE_TEMPLATE_SET', 'No template set is currently active', 404)
  }
  const payload = buildPromptTemplateExportPayload(set)
  const filename = promptTemplateExportFilename(set.name, set.version)
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    },
  })
}

export async function importPromptTemplates(
  actor: Actor,
  input: unknown,
): Promise<NextResponse> {
  const validated = validatePromptTemplateImport(input)
  if (isValidationError(validated)) return validationToResponse(validated)
  try {
    const result = await transaction(async (client) => {
      const created = await createPromptTemplateSetWithEntries(client, {
        name: validated.input.name,
        activate: validated.input.activate,
        createdBy: actor.id,
        entries: validated.input.templates,
      })
      await auditTemplate(client, actor, 'prompt_templates.import', created.id, {
        name: created.name,
        version: created.version,
        entryCount: created.entries.length,
        isActive: created.isActive,
      })
      const payload: ImportPromptTemplateSetResult = {
        imported: true,
        setId: created.id,
        name: created.name,
        version: created.version,
        entryCount: created.entries.length,
        isActive: created.isActive,
      }
      return payload
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Template import failed', 500)
  }
}

export async function previewPromptTemplate(input: unknown): Promise<NextResponse> {
  const validated = validatePromptTemplatePreview(input)
  if (isValidationError(validated)) return validationToResponse(validated)
  return ok(validated.preview)
}

export async function activatePromptTemplateSet(actor: Actor, setId: string): Promise<NextResponse> {
  if (!isPromptTemplateSetId(setId)) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  try {
    const result = await transaction(async (client) => {
      const activated = await activatePromptTemplateSetTx(client, setId)
      if (!activated) throw new Error('TEMPLATE_SET_NOT_FOUND')
      await auditTemplate(client, actor, 'prompt_templates.activate', activated.id, {
        name: activated.name,
        version: activated.version,
      })
      return toPromptTemplateSetSummaryDto(activated)
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Failed to enable template', 500)
  }
}

export async function createPromptTemplateEntry(
  actor: Actor,
  setId: string,
  input: unknown,
): Promise<NextResponse> {
  if (!isPromptTemplateSetId(setId)) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  const validated = validatePromptTemplateEntryCreate(input)
  if (isValidationError(validated)) return validationToResponse(validated)
  try {
    const result = await transaction(async (client) => {
      const forked = await createPromptTemplateEntryTx(client, setId, validated.entry, {
        createdBy: actor.id,
      })
      await auditTemplate(client, actor, 'prompt_templates.entry_create', forked.id, {
        sourceSetId: setId,
        name: validated.entry.name,
        version: forked.version,
      })
      return toPromptTemplateSetDetailDto(forked)
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Failed to create template', 500)
  }
}

export async function updatePromptTemplateEntry(
  actor: Actor,
  entryId: string,
  input: unknown,
): Promise<NextResponse> {
  if (!isPromptTemplateSetId(entryId)) return fail('TEMPLATE_ENTRY_NOT_FOUND', 'Template not found', 404)
  const validated = validatePromptTemplateEntryPatch(input)
  if (isValidationError(validated)) return validationToResponse(validated)
  try {
    const result = await transaction(async (client) => {
      const forked = await updatePromptTemplateEntryTx(client, entryId, validated.patch, {
        createdBy: actor.id,
      })
      if (!forked) throw new Error('TEMPLATE_ENTRY_NOT_FOUND')
      await auditTemplate(client, actor, 'prompt_templates.entry_update', forked.id, {
        sourceEntryId: entryId,
        version: forked.version,
      })
      return toPromptTemplateSetDetailDto(forked)
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Failed to update template', 500)
  }
}

export async function deletePromptTemplateSet(actor: Actor, setId: string): Promise<NextResponse> {
  if (!isPromptTemplateSetId(setId)) return fail('TEMPLATE_SET_NOT_FOUND', 'Template set not found', 404)
  try {
    const result = await transaction(async (client) => {
      const outcome = await deletePromptTemplateSetTx(client, setId)
      if (!outcome.deleted) throw new Error(outcome.error ?? 'TEMPLATE_SET_NOT_FOUND')
      await auditTemplate(client, actor, 'prompt_templates.delete', setId, {})
      return { deleted: true }
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Failed to delete template', 500)
  }
}

export async function deletePromptTemplateEntry(actor: Actor, entryId: string): Promise<NextResponse> {
  if (!isPromptTemplateSetId(entryId)) return fail('TEMPLATE_ENTRY_NOT_FOUND', 'Template not found', 404)
  try {
    const result = await transaction(async (client) => {
      const outcome = await deletePromptTemplateEntryTx(client, entryId, { createdBy: actor.id })
      if (!outcome.deleted) throw new Error('TEMPLATE_ENTRY_NOT_FOUND')
      await auditTemplate(client, actor, 'prompt_templates.entry_delete', outcome.newSetId ?? '', {
        sourceEntryId: entryId,
      })
      return { deleted: true, setId: outcome.newSetId }
    })
    return ok(result)
  } catch (error) {
    return repoErrorToResponse(error) ?? fail('INTERNAL_ERROR', 'Failed to delete template', 500)
  }
}
