'use client'

import { useState } from 'react'
import { Button } from '@/shared/components/ui'
import { appendAdminCursor } from '../lib/admin-list-state'

export function useAdminCursor() {
  const [history, setHistory] = useState<Array<string | undefined>>([undefined])
  const cursor = history.at(-1)
  return {
    cursor,
    batch: history.length,
    reset: () => setHistory([undefined]),
    previous: () => setHistory((previous) => previous.length > 1 ? previous.slice(0, -1) : previous),
    next: (nextCursor: string | undefined) => setHistory((previous) => appendAdminCursor(previous, cursor, nextCursor)),
  }
}

export function AdminCursorControls({ batch, count, total, hasMore, nextCursor, busy, onPrevious, onNext }: {
  batch: number; count: number; total?: number; hasMore?: boolean; nextCursor?: string; busy: boolean
  onPrevious: () => void; onNext: () => void
}) {
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-muted-foreground">Batch {batch} · {count} items in this batch · {total ?? '—'} total matches</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className="min-h-[var(--control-lg)] md:min-h-[var(--control-md)]" disabled={batch === 1 || busy} onClick={onPrevious}>Previous batch</Button>
      <Button variant="secondary" className="min-h-[var(--control-lg)] md:min-h-[var(--control-md)]" disabled={!hasMore || !nextCursor || busy} onClick={onNext}>Next batch</Button>
    </div>
  </div>
}
