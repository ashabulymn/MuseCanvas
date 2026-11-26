import type { AdminJob, ApiResponse, Invitation } from '@/shared/types'

/** A failed envelope must reject the Query, never masquerade as an empty list. */
export function requireAdminData<T>(response: ApiResponse<T>, fallback: string): T {
  if (!response.success || response.data == null) {
    throw Object.assign(new Error(response.error?.message || fallback), {
      code: response.error?.code || 'INVALID_RESPONSE',
    })
  }
  return response.data
}

/** Provider payloads may contain prompts, endpoints or credentials: never render them. */
export function adminJobErrorSummary(job: Pick<AdminJob, 'errorCode' | 'providerError'>): string {
  const parts: string[] = []
  if (job.errorCode) {
    parts.push(/^[A-Z][A-Z0-9_]{0,99}$/.test(job.errorCode) ? job.errorCode : 'Error code unavailable')
  }
  const status = job.providerError?.status
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
    parts.push(`Provider HTTP ${status}`)
  }
  return parts.join(' · ') || (job.providerError ? 'Provider error (no safe summary)' : '')
}

/** Full task detail values are a whitelist, not a raw DTO or provider-payload dump. */
export function adminJobDetailValues(job: AdminJob) {
  return {
    id: job.id,
    createdBy: job.createdBy || '—',
    modelName: job.modelName || 'Unknown model',
    modelId: job.modelId,
    status: job.status,
    errorSummary: adminJobErrorSummary(job) || '—',
    createdAt: job.createdAt,
  }
}

export function invitationStatus(invitation: Invitation): {
  label: string
  tone: 'danger' | 'neutral'
} {
  if (invitation.used) return { label: 'Used', tone: 'danger' }
  if (invitation.revoked) return { label: 'Revoked', tone: 'neutral' }
  // The admin list does not return expiresAt; creation time cannot prove validity.
  return { label: 'Unused, expiry unknown', tone: 'neutral' }
}
