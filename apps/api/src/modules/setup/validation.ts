import { emailValid } from '../../shared/http'
import { PROMPT_TEMPLATE_VAR_LOOKUP } from '@musecanvas/contracts'

// Pure validators for the persisted onboarding endpoints. Every function is
// synchronous and side-effect free: callers map failures to fail() responses
// and only persist after successful connection tests.

export interface InputError {
  code: string
  message: string
}

export const INVALID_INPUT = (message: string): InputError => ({ code: 'INVALID_INPUT', message })

export function rejectUnknownFields(input: Record<string, unknown>, allowed: ReadonlySet<string>): InputError | null {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return INVALID_INPUT('Request contains disallowed fields')
  }
  return null
}

function optionalText(value: unknown, maxLength: number): string | null | undefined | InputError {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return INVALID_INPUT('Invalid request parameter type')
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.length > maxLength) return INVALID_INPUT('Request parameter length exceeds the limit')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) return INVALID_INPUT('Request parameter contains illegal characters')
  return trimmed
}

function requiredText(value: unknown, maxLength: number, message: string): string | InputError {
  const parsed = optionalText(value, maxLength)
  if (parsed instanceof Object && 'code' in parsed) return parsed
  if (parsed === undefined || parsed === null) return INVALID_INPUT(message)
  return parsed
}

function optionalInt(
  value: unknown,
  min: number,
  max: number,
): number | null | undefined | InputError {
  if (value === undefined) return undefined
  if (value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return INVALID_INPUT('Numeric parameter is out of range')
  return parsed
}

// Canonical public origin: scheme + host (+ port) only, no trailing slash.
export function canonicalPublicOrigin(raw: unknown): string | InputError {
  if (typeof raw !== 'string' || !raw.trim()) return INVALID_INPUT('Site address cannot be empty')
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (trimmed.length > 500) return INVALID_INPUT('Site address is too long')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { code: 'PUBLIC_ORIGIN_INVALID', message: 'Site address must be a valid URL' }
  }
  const insecureOk = process.env.ALLOW_INSECURE_PUBLIC_ORIGIN === 'true'
  const host = url.hostname.toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (isLocal || insecureOk))) {
    return { code: 'PUBLIC_ORIGIN_INVALID', message: 'Site address must use HTTPS' }
  }
  if (url.username || url.password || url.search || url.hash) {
    return { code: 'PUBLIC_ORIGIN_INVALID', message: 'Site address cannot contain authentication info or query parameters' }
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return { code: 'PUBLIC_ORIGIN_INVALID', message: 'Site address cannot contain a path' }
  }
  return url.origin
}

const SITE_FIELDS = new Set(['siteName', 'siteUrl'])

export interface ValidSiteInput {
  siteName: string
  siteUrl: string | null
}

export function validateSiteInput(input: Record<string, unknown>): ValidSiteInput | InputError {
  const unknown = rejectUnknownFields(input, SITE_FIELDS)
  if (unknown) return unknown
  const siteName = requiredText(input.siteName, 120, 'Site name cannot be empty')
  if (typeof siteName !== 'string') return siteName
  if (input.siteUrl === undefined || input.siteUrl === null || input.siteUrl === '') {
    return { siteName, siteUrl: null }
  }
  const siteUrl = canonicalPublicOrigin(input.siteUrl)
  if (typeof siteUrl !== 'string') return siteUrl
  return { siteName, siteUrl }
}

const SMTP_FIELDS = new Set(['host', 'port', 'tlsMode', 'username', 'password', 'fromAddress', 'fromName'])

export type SmtpPasswordAction = { kind: 'keep' } | { kind: 'clear' } | { kind: 'set'; password: string }

export interface ValidSmtpInput {
  host: string | null | undefined
  port: number | null | undefined
  tlsMode: 'none' | 'starttls' | 'implicit_tls' | undefined
  username: string | null | undefined
  password: SmtpPasswordAction
  fromAddress: string | null | undefined
  fromName: string | null | undefined
}

export function validateSmtpInput(input: Record<string, unknown>): ValidSmtpInput | InputError {
  const unknown = rejectUnknownFields(input, SMTP_FIELDS)
  if (unknown) return unknown
  const host = optionalText(input.host, 253)
  if (host instanceof Object && 'code' in host) return host
  const port = optionalInt(input.port, 1, 65535)
  if (port instanceof Object && 'code' in port) return port
  let tlsMode: ValidSmtpInput['tlsMode'] = undefined
  if (input.tlsMode !== undefined) {
    if (input.tlsMode !== 'none' && input.tlsMode !== 'starttls' && input.tlsMode !== 'implicit_tls') {
      return INVALID_INPUT('Invalid TLS mode')
    }
    tlsMode = input.tlsMode
  }
  const username = optionalText(input.username, 254)
  if (username instanceof Object && 'code' in username) return username
  let password: SmtpPasswordAction = { kind: 'keep' }
  if (input.password !== undefined) {
    if (input.password === null || input.password === '') {
      password = { kind: 'clear' }
    } else if (typeof input.password !== 'string' || input.password.length > 2000) {
      return INVALID_INPUT('Invalid SMTP password')
    } else {
      password = { kind: 'set', password: input.password }
    }
  }
  const fromAddress = optionalText(input.fromAddress, 254)
  if (fromAddress instanceof Object && 'code' in fromAddress) return fromAddress
  if (fromAddress && !emailValid(fromAddress)) return INVALID_INPUT('Invalid sender email format')
  const fromName = optionalText(input.fromName, 120)
  if (fromName instanceof Object && 'code' in fromName) return fromName
  if (
    tlsMode === 'none'
    && process.env.NODE_ENV === 'production'
    && process.env.ALLOW_INSECURE_SMTP !== 'true'
  ) {
    return INVALID_INPUT('SMTP encryption must be enabled in production')
  }
  return { host, port, tlsMode, username, password, fromAddress, fromName }
}

function validHttpUrl(raw: string, field: string): string | InputError {
  if (raw.length > 500) return INVALID_INPUT(`${field} is too long`)
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return INVALID_INPUT(`${field} must be a valid URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return INVALID_INPUT(`${field} must use HTTP(S)`)
  if (url.username || url.password || url.search || url.hash) return INVALID_INPUT(`${field} cannot contain authentication info or query parameters`)
  return url.toString().replace(/\/+$/, '')
}

const STORAGE_FIELDS = new Set([
  'endpoint',
  'publicEndpoint',
  'region',
  'bucket',
  'accessKeyId',
  'secretAccessKey',
  'signedUrlTtlSeconds',
])

export type StorageSecretAction = { kind: 'keep' } | { kind: 'clear' } | { kind: 'set'; secret: string }

export interface ValidStorageInput {
  endpoint: string | null | undefined
  publicEndpoint: string | null | undefined
  region: string | null | undefined
  bucket: string | null | undefined
  accessKeyId: string | null | undefined
  secret: StorageSecretAction
  signedUrlTtlSeconds: number | null | undefined
}

export function validateStorageInput(input: Record<string, unknown>): ValidStorageInput | InputError {
  const unknown = rejectUnknownFields(input, STORAGE_FIELDS)
  if (unknown) return unknown
  let endpoint: string | null | undefined
  if (input.endpoint !== undefined) {
    if (input.endpoint === null || input.endpoint === '') {
      endpoint = null
    } else if (typeof input.endpoint !== 'string') {
      return INVALID_INPUT('Invalid object storage endpoint')
    } else {
      const parsed = validHttpUrl(input.endpoint, 'Object storage endpoint')
      if (typeof parsed !== 'string') return parsed
      endpoint = parsed
    }
  }
  let publicEndpoint: string | null | undefined
  if (input.publicEndpoint !== undefined) {
    if (input.publicEndpoint === null || input.publicEndpoint === '') {
      publicEndpoint = null
    } else if (typeof input.publicEndpoint !== 'string') {
      return INVALID_INPUT('Invalid object storage public endpoint')
    } else {
      const parsed = validHttpUrl(input.publicEndpoint, 'Object storage public endpoint')
      if (typeof parsed !== 'string') return parsed
      publicEndpoint = parsed
    }
  }
  let region: string | null | undefined = undefined
  if (input.region !== undefined) {
    if (input.region === null || input.region === '') {
      region = null
    } else if (typeof input.region !== 'string' || !/^[a-z0-9-]{1,32}$/.test(input.region.trim())) {
      return INVALID_INPUT('Invalid storage region')
    } else {
      region = input.region.trim()
    }
  }
  let bucket: string | null | undefined = undefined
  if (input.bucket !== undefined) {
    if (input.bucket === null || input.bucket === '') {
      bucket = null
    } else if (typeof input.bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(input.bucket.trim())) {
      return INVALID_INPUT('Invalid storage bucket name')
    } else {
      bucket = input.bucket.trim()
    }
  }
  const accessKeyId = optionalText(input.accessKeyId, 256)
  if (accessKeyId instanceof Object && 'code' in accessKeyId) return accessKeyId
  let secret: StorageSecretAction = { kind: 'keep' }
  if (input.secretAccessKey !== undefined) {
    if (input.secretAccessKey === null || input.secretAccessKey === '') {
      secret = { kind: 'clear' }
    } else if (typeof input.secretAccessKey !== 'string' || input.secretAccessKey.length > 2000) {
      return INVALID_INPUT('Invalid object storage secret key')
    } else {
      secret = { kind: 'set', secret: input.secretAccessKey }
    }
  }
  const signedUrlTtlSeconds = optionalInt(input.signedUrlTtlSeconds, 60, 3600)
  if (signedUrlTtlSeconds instanceof Object && 'code' in signedUrlTtlSeconds) return signedUrlTtlSeconds
  return { endpoint, publicEndpoint, region, bucket, accessKeyId, secret, signedUrlTtlSeconds }
}

const RUNTIME_FIELDS = new Set([
  'uploadTtlSeconds',
  'signedUrlTtlSeconds',
  'maxImageBytes',
  'maxTotalBytes',
  'maxInputs',
  'providerTimeoutMs',
  'maxOutputBytes',
  'jobLeaseMs',
])

export interface ValidRuntimeInput {
  uploadTtlSeconds?: number | null
  signedUrlTtlSeconds?: number | null
  maxImageBytes?: number | null
  maxTotalBytes?: number | null
  maxInputs?: number | null
  providerTimeoutMs?: number | null
  maxOutputBytes?: number | null
  jobLeaseMs?: number | null
}

const RUNTIME_RANGES: Record<keyof ValidRuntimeInput, [number, number]> = {
  uploadTtlSeconds: [300, 604800],
  signedUrlTtlSeconds: [60, 3600],
  maxImageBytes: [1, 100_000_000],
  maxTotalBytes: [1, 200_000_000],
  maxInputs: [1, 32],
  providerTimeoutMs: [1, 3_600_000],
  maxOutputBytes: [1, 100_000_000],
  jobLeaseMs: [1, 3_600_000],
}

export function validateRuntimeInput(input: Record<string, unknown>): ValidRuntimeInput | InputError {
  const unknown = rejectUnknownFields(input, RUNTIME_FIELDS)
  if (unknown) return unknown
  const output: ValidRuntimeInput = {}
  let present = 0
  for (const key of RUNTIME_FIELDS) {
    const value = input[key]
    if (value === undefined) continue
    present += 1
    if (value === null) {
      output[key as keyof ValidRuntimeInput] = null
      continue
    }
    const [min, max] = RUNTIME_RANGES[key as keyof ValidRuntimeInput]
    const parsed = optionalInt(value, min, max)
    if (parsed instanceof Object && 'code' in parsed) return parsed
    output[key as keyof ValidRuntimeInput] = parsed as number
  }
  if (present === 0) return INVALID_INPUT('Runtime settings cannot be empty')
  const maxImage = output.maxImageBytes ?? undefined
  const maxTotal = output.maxTotalBytes ?? undefined
  if (typeof maxImage === 'number' && typeof maxTotal === 'number' && maxTotal < maxImage) {
    return INVALID_INPUT('Total size limit cannot be less than the single-image size limit')
  }
  return output
}

export const TEMPLATE_ALLOWED_VARIABLES: Readonly<Record<string, true>> = PROMPT_TEMPLATE_VAR_LOOKUP

export const TEMPLATE_MAX_ENTRIES = 100
export const TEMPLATE_MAX_INSTRUCTION_BYTES = 128 * 1024

export interface ValidTemplateEntry {
  name: string
  description: string
  instruction: string
}

function templateVariablesValid(instruction: string): boolean {
  const variables = [...instruction.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map((match) => match[1].trim())
  if (variables.some((variable) => TEMPLATE_ALLOWED_VARIABLES[variable] !== true)) return false
  return !/{{|}}/.test(instruction.replace(/{{\s*([^{}]+?)\s*}}/g, ''))
}

export function validateTemplateImport(input: unknown): ValidTemplateEntry[] | InputError {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return INVALID_INPUT('Invalid template list')
  // Boundary value: narrowed to a non-array object; fields are validated per use below.
  const record: Record<string, unknown> = input as Record<string, unknown>
  const raw = record.templates ?? record.entries
  if (!Array.isArray(raw)) return INVALID_INPUT('Invalid template list')
  if (raw.length === 0 || raw.length > TEMPLATE_MAX_ENTRIES) return INVALID_INPUT('Template count must be between 1 and 100')
  const names = new Set<string>()
  const entries: ValidTemplateEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return INVALID_INPUT('Invalid template entry')
    const record = item as Record<string, unknown>
    const name = requiredText(record.name, 120, 'Template name cannot be empty')
    if (typeof name !== 'string') return name
    if (names.has(name)) return INVALID_INPUT('Template names must be unique')
    names.add(name)
    const descriptionRaw = record.description
    if (descriptionRaw !== undefined && descriptionRaw !== null && typeof descriptionRaw !== 'string') {
      return INVALID_INPUT('Invalid template description')
    }
    const description = typeof descriptionRaw === 'string' ? descriptionRaw.trim() : ''
    if (description.length > 1000) return INVALID_INPUT('Template description is too long')
    const instructionRaw = record.instruction ?? record.content
    if (typeof instructionRaw !== 'string' || !instructionRaw.trim()) return INVALID_INPUT('Template content cannot be empty')
    if (Buffer.byteLength(instructionRaw, 'utf8') > TEMPLATE_MAX_INSTRUCTION_BYTES) {
      return INVALID_INPUT('Template content exceeds the 128KB limit')
    }
    if (instructionRaw.indexOf(String.fromCharCode(0)) !== -1) return INVALID_INPUT('Template content contains illegal characters')
    if (!templateVariablesValid(instructionRaw)) return INVALID_INPUT('Template contains unsupported variables')
    entries.push({ name, description, instruction: instructionRaw })
  }
  return entries
}
