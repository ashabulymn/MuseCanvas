'use client'

import { Alert } from '@/shared/components/ui'

export interface AdminDeleteConfirmationProps {
  objectName: string
  impact: string
  pending: boolean
  error?: string
  cancelLabel: 'Cancel' | 'Back to details'
  onCancel: () => void
  onConfirm: () => void
}

/** Content only: detail and confirmation must share their owning Dialog's lifecycle. */
export function AdminDeleteConfirmation({ objectName, impact, error }: AdminDeleteConfirmationProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="break-words text-sm">Delete object: <strong>{objectName}</strong></p>
      <p className="text-sm text-muted-foreground">{impact}</p>
      {error && <Alert tone="danger" role="alert" title="Deletion not completed">{error}. You can retry or cancel.</Alert>}
    </div>
  )
}

export function AdminActionErrors({ errors }: { errors: Record<string, string> }) {
  return Object.entries(errors).map(([id, message]) => (
    <Alert key={id} tone="danger" role="alert" title="Action not completed">{message}. Please fix it and retry.</Alert>
  ))
}
