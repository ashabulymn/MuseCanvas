import { Alert, Button } from '@/shared/components/ui'

/** Keep previous data visible when a background refresh fails. */
export function AdminQueryFeedback({
  error,
  hasData,
  label,
  onRetry,
}: {
  error: Error | null
  hasData: boolean
  label: string
  onRetry: () => void
}) {
  if (!error) return null
  return (
    <Alert
      tone="danger"
      role="alert"
      title={hasData ? `${label} refresh failed` : `Unable to load ${label}`}
      action={<Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    >
      {error.message}.{hasData ? 'Still showing the last successfully loaded data, which may be outdated.' : 'Please try again later.'}
    </Alert>
  )
}
