'use client'

import { Alert, Button, Dialog, EmptyState, SkeletonRow } from '@/shared/components/ui'
import { MediaFrame } from '@/shared/components/media-frame'
import { JobStatusBadge } from '@/shared/components/job-status-badge'
import { isJobActive } from '@/shared/lib/job-status'
import { cn } from '@/shared/lib/cn'
import { isVideoOutput, outputUrl } from '@/shared/types'
import { ActiveJobsBoard } from './active-jobs-board'
import type { ActiveJobsBoardProps } from './active-jobs-board'

export interface GenerationTaskPanelProps extends ActiveJobsBoardProps {
  open: boolean
  onClose: () => void
  busy: boolean
  actionErrors: Record<string, string>
}

export function GenerationTaskPanel({ open, onClose, busy, actionErrors, ...board }: GenerationTaskPanelProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Tasks and recent history" size="wide" description={`Latest 30 loaded tasks (currently ${board.jobs.length}); the running count only covers this list, not the full queue.`}>
      <ActiveJobsBoard {...board} actionErrors={actionErrors} disabled={busy} variant="inline" open />
      <h3 className="mb-3 mt-6 text-sm font-medium text-foreground">Recent history</h3>
      {board.isLoading && board.jobs.length === 0 ? <SkeletonRow cells={3} /> : board.jobs.length === 0 ? <EmptyState density="compact" variant="first-use" title="No generation history yet" description="Tasks will appear here after you submit. Viewing history never changes your draft." /> : (
        <ul className="flex flex-col gap-2">
          {board.jobs.map((job) => {
            const output = job.outputs?.[0]
            return <li key={job.id} className={cn('flex flex-col gap-2 rounded-control p-3', job.id === board.selectedJobId ? 'bg-tonal-selected' : 'bg-tonal')}>
              <button type="button" disabled={busy} onClick={() => { board.onSelectJob(job.id); onClose() }} aria-current={job.id === board.selectedJobId ? 'true' : undefined} className="flex w-full min-w-0 items-center gap-3 text-left">
                {output && <span className="h-12 w-12 shrink-0 overflow-hidden rounded-control"><MediaFrame src={outputUrl(output)} kind={isVideoOutput(output) ? 'video' : 'image'} alt="" layout="thumb" /></span>}
                <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="line-clamp-2 break-words text-sm text-foreground">{job.inputPrompt ?? job.prompt}</span><span className="truncate text-xs text-muted-foreground">{job.modelName} · {new Date(job.createdAt).toLocaleString()}</span></span>
                <JobStatusBadge status={job.status} />
              </button>
              {(isJobActive(job) || job.status === 'failed') && <div className="flex flex-wrap gap-2">
                {isJobActive(job) && <Button variant="danger-ghost" size="sm" onClick={() => board.onCancel(job.id)} loading={board.pendingCancelId === job.id} disabled={busy || Boolean(job.cancelRequested) || Boolean(board.pendingCancelId)}>{job.cancelRequested ? 'Cancelling' : 'Cancel task'}</Button>}
                {job.status === 'failed' && <Button variant="secondary" size="sm" onClick={() => board.onRetry(job.id)} loading={board.pendingRetryId === job.id} disabled={busy || Boolean(board.pendingRetryId)}>Retry original task</Button>}
              </div>}
              {actionErrors[job.id] && <Alert tone="danger" role="alert">{actionErrors[job.id]}</Alert>}
            </li>
          })}
        </ul>
      )}
    </Dialog>
  )
}
