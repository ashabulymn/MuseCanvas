'use client'

import { useState } from 'react'
import { Alert, Button, Input, useToast } from '@/shared/components/ui'
import { copyAdminValue } from '../lib/admin-copy'

export function AdminCopyValue({ value, label, unavailable = 'Plaintext unavailable; cannot copy.' }: { value?: string; label: string; unavailable?: string }) {
  const [failed, setFailed] = useState(false)
  const [copying, setCopying] = useState(false)
  const toast = useToast()
  if (!value) return <span className="text-xs text-muted-foreground">{unavailable}</span>
  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 select-text break-all font-mono">{value}</span>
      <Button variant="secondary" size="sm" className="min-h-[var(--control-lg)] md:min-h-[var(--control-sm)]" loading={copying} aria-label={`Copy ${label}`} onClick={async () => {
        setCopying(true)
        try {
          await copyAdminValue(value, navigator.clipboard)
          setFailed(false)
          toast.push({ variant: 'success', title: `${label} copied` })
        } catch {
          setFailed(true)
        } finally {
          setCopying(false)
        }
      }}>Copy</Button>
    </div>
    {failed && <>
      <Alert tone="info" role="status">Automatic copy failed. Select the full value below to copy it manually, or try the copy button again.</Alert>
      <Input readOnly value={value} aria-label={`${label} full value, for manual copying`} onFocus={(event) => event.target.select()} />
    </>}
  </div>
}
