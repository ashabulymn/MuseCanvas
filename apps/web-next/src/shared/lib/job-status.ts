import type { GenerationJob, JobStatus } from '@/shared/types'

export const ACTIVE_JOB_STATUSES = ['queued', 'running', 'retry_wait'] as const

export function isJobActive(job: Pick<GenerationJob, 'status'>): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status)
}

export interface JobStatusMeta {
  /** The state in words. Colour is never the only carrier — this label is always
   *  rendered next to the dot. */
  label: string
  /** Weak-background + strong-foreground pair (`{status}-soft` + `{status}`): the
   *  badge never wears a solid semantic fill, and certainly not a solid brand
   *  green. Every pair clears 4.5:1 at 12px in *both* themes — light e.g.
   *  `text-info` #1e40af on `bg-info-soft` #eff6ff (~8:1), dark e.g. `text-info`
   *  #60a5fa on `bg-info-soft` #172554 (~6:1), because the tokens invert together.
   *  `running` uses `text-accent-strong` rather than `text-accent` (3.94:1). */
  badge: string
  /** The 8px status dot: a graphic, so it only needs 3:1 against the badge's own
   *  soft background, which every solid here clears. */
  dot: string
}

const JOB_STATUS_META: Record<JobStatus, JobStatusMeta> = {
  queued: { label: 'Queued', badge: 'bg-info-soft text-info', dot: 'bg-info' },
  running: { label: 'Generating', badge: 'bg-accent-soft text-accent-strong', dot: 'bg-accent' },
  retry_wait: { label: 'Waiting to retry', badge: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  succeeded: { label: 'Completed', badge: 'bg-success-soft text-success', dot: 'bg-success' },
  failed: { label: 'Failed', badge: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  canceled: { label: 'Cancelled', badge: 'bg-neutral-soft text-neutral-status', dot: 'bg-neutral-status' },
}

export function jobStatusMeta(status: JobStatus): JobStatusMeta {
  return JOB_STATUS_META[status] ?? JOB_STATUS_META.queued
}

const PHASE_LABEL: Record<string, string> = {
  template_selecting: 'Selecting template',
  template_selected: 'Template selected',
  template_skipped: 'Template skipped',
  template_failed: 'Template unavailable',
  prompt_optimizing: 'Optimizing prompt',
  prompt_ready: 'Prompt ready',
  optimization_failed: 'Prompt optimization failed',
  preprocessing: 'Preprocessing input',
  provider_submitting: 'Submitting to generation service',
  provider_waiting: 'Waiting for response',
  provider_canceling: 'Cancelling',
  artifact_importing: 'Fetching outputs',
  asset_persisting: 'Saving assets',
  image_generating: 'Generating image',
  generation_failed: 'Generation failed',
  completed: 'Completed',
}

/** `phase` is the only truthful stage signal; `progress` is written as 0 or 100
 *  by the worker, so no percentage may be rendered from it. */
export function phaseLabel(phase?: string | null): string {
  return (phase && PHASE_LABEL[phase]) || 'Preparing'
}

/** `MM:SS` of work spent, measured from `startedAt` and falling back to submission. */
export function formatElapsed(
  job: Pick<GenerationJob, 'startedAt' | 'createdAt'>,
  now: number = Date.now(),
): string {
  const raw = job.startedAt || job.createdAt
  const started = raw ? Date.parse(raw) : NaN
  if (!Number.isFinite(started)) return '00:00'
  const total = Math.max(0, Math.floor((now - started) / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
