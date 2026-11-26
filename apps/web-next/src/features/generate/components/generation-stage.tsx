'use client'

import { useEffect, useState } from 'react'
import { ClockIcon, CropIcon, DownloadSimpleIcon, SparkleIcon } from '@phosphor-icons/react'
import { Alert, Button, EmptyState, Progress, Spinner, buttonVariants } from '@/shared/components/ui'
import { JobStatusBadge } from '@/shared/components/job-status-badge'
import { MediaFrame } from '@/shared/components/media-frame'
import { formatElapsed, isJobActive, phaseLabel } from '@/shared/lib/job-status'
import { cn } from '@/shared/lib/cn'
import { isVideoOutput, outputUrl } from '@/shared/types'
import type { GenerateModeTab, GenerationJob, GenerationOutput } from '@/shared/types'
import type { EditTarget } from '@/shared/stores/generate-ui-store'
import type { EditSelection } from '@musecanvas/contracts'
import { EditRegionStage } from './edit-region-stage'

export interface GenerationStageProps {
  tab: GenerateModeTab
  job: GenerationJob | null
  loading: boolean
  queryFailed: boolean
  onReload: () => void
  activeCount: number
  onOpenTasks: () => void
  outputIndex: number
  onOutputChange: (index: number) => void
  editTarget: EditTarget | null
  onSelectionChange: (selection: EditSelection | null) => void
  onExitEdit: () => void
  onStartEdit: (output: GenerationOutput) => void
  editBlockedReason: string | null
  busy: boolean
  modelAvailable: boolean
  onExample: (text: string) => void
  onReuse: (job: GenerationJob) => void
  reuseBlocked: boolean
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  pendingCancelId: string | null
  pendingRetryId: string | null
  actionError?: string
}

const EXAMPLES = {
  image: ['Warm white ceramic vase, soft morning light by the window, minimalist product photography', 'Mountain cabin in thin mist, watercolor illustration, soft autumn colors'],
  video: ['Slow camera push through a misty forest at dawn, morning light through the leaves, steady movement', 'Waves gently lapping a beach, sunset reflecting on the water, static shot, tranquil mood'],
}

export function GenerationStage(props: GenerationStageProps) {
  const { job, editTarget, busy } = props
  const active = Boolean(job && isJobActive(job))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, job?.id])
  const outputs = job?.outputs ?? []
  const index = Math.max(0, Math.min(props.outputIndex, outputs.length - 1))
  const output = outputs[index]
  const video = output ? isVideoOutput(output) : false
  const phase = job?.cancelRequested ? 'Cancelling' : job?.status === 'queued' ? 'Waiting to be scheduled' : job?.status === 'retry_wait' ? 'Waiting to retry' : phaseLabel(job?.phase)
  const localEditReason = !output?.assetId ? 'This output has no asset ID, so local edit is unavailable.' : props.editBlockedReason

  return (
    <section aria-label="Result canvas" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">{editTarget ? 'Local edit' : props.tab === 'video' ? 'Video creation' : 'Image creation'}</h1>
          {!editTarget && job && <JobStatusBadge status={job.status} busy={active} />}
          {!editTarget && active && <span className="text-xs text-muted-foreground">{phase} · <span className="font-mono tabular-nums">{formatElapsed(job!, now)}</span></span>}
        </div>
        <Button variant="secondary" size="sm" onClick={props.onOpenTasks} icon={<ClockIcon weight="bold" aria-hidden="true" />}>
          Tasks · {props.activeCount} running
        </Button>
      </div>
      {props.queryFailed && (
        <Alert tone="warning" title={job ? 'Task refresh failed — keeping the loaded results' : 'Task list failed to load'} action={<Button variant="secondary" size="sm" onClick={props.onReload}>Reload</Button>} />
      )}
      {!editTarget && job && (
        <details className="shrink-0 px-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{job.modelName} · View this prompt</summary>
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words py-2">{job.inputPrompt ?? job.prompt}</p>
        </details>
      )}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-card bg-tonal">
        {editTarget ? (
          <div inert={busy} aria-busy={busy} onKeyDownCapture={(event) => {
            if (event.key !== 'Escape' || busy) return
            event.preventDefault()
            event.stopPropagation()
            props.onSelectionChange(null)
          }} className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-3 [&>div]:min-h-0 [&>div]:flex-1 [&>div>div:first-child]:min-h-0 [&>div>div:first-child]:flex-1 [&>div>div:first-child]:max-h-none [&>div>div:first-child]:[aspect-ratio:auto!important]">
            <EditRegionStage src={editTarget.url} alt="Local edit source image" declaredWidth={editTarget.width} declaredHeight={editTarget.height} selection={editTarget.selection} onSelectionChange={props.onSelectionChange} />
          </div>
        ) : output && job?.status === 'succeeded' ? (
          <MediaFrame key={output.id} src={outputUrl(output)} kind={video ? 'video' : 'image'} alt={job.prompt} layout="stage" width={output.metadata.width} height={output.metadata.height} aspectRatio={output.metadata.aspectRatio} showControls={video} className="h-full w-full object-contain" />
        ) : active ? (
          <div className="flex max-h-full w-full max-w-lg flex-col items-center gap-3 overflow-y-auto p-4 text-center">
            <Spinner size="lg" label={phase} />
            <p className="text-sm font-medium text-foreground">{phase}</p>
            <Progress value={null} label="Processing task" showLabelRow={false} className="w-full" />
            <p className="text-xs text-muted-foreground">Elapsed {formatElapsed(job!, now)} · You can prepare your next creation while the task runs in the background.</p>
          </div>
        ) : job?.status === 'failed' ? (
          <div className="max-h-full overflow-y-auto p-4"><EmptyState variant="error" title="Generation failed" description={job.errorMessage ?? job.errorCode ?? 'The generation service could not finish the task. Retry, or adjust the draft using this configuration.'} /></div>
        ) : job?.status === 'canceled' ? (
          <div className="max-h-full overflow-y-auto p-4"><EmptyState variant="no-results" title="Task cancelled" description="This task has ended. Use this configuration to prepare a draft again — it will not submit automatically." /></div>
        ) : job ? (
          <div className="max-h-full overflow-y-auto p-4"><EmptyState variant="no-results" title="No outputs to show yet" description="Reload the task list, or use this configuration to prepare a draft again." action={<Button variant="secondary" size="sm" onClick={props.onReload}>Reload tasks</Button>} /></div>
        ) : props.loading ? (
          <Spinner label="Loading tasks" />
        ) : (
          <div className="flex max-h-full max-w-lg flex-col items-center gap-4 overflow-y-auto p-4 text-center md:p-6">
            <SparkleIcon weight="duotone" aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <h2 className="text-module text-foreground">Turn ideas into images</h2>
            <p className="text-sm text-muted-foreground">{props.modelAvailable ? 'Describe the image below, pick a model, then submit when ready. Or start from an example.' : 'No model is available right now. Configure a model first; your draft is kept below.'}</p>
            {props.modelAvailable && <div className="flex w-full flex-col gap-2">{EXAMPLES[props.tab].map((text) => <Button key={text} variant="secondary" size="sm" disabled={busy} className="whitespace-normal text-left" onClick={() => props.onExample(text)}>{text}</Button>)}</div>}
          </div>
        )}
      </div>
      {editTarget ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">The source image stays unchanged · Select an area, then write the edit instruction</p>
          <Button variant="secondary" size="sm" disabled={busy} onClick={props.onExitEdit}>Exit local edit</Button>
        </div>
      ) : job ? (
        <div className="flex shrink-0 flex-col gap-2">
          {outputs.length > 1 && <div aria-label="Switch output" className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-xs text-muted-foreground">{index + 1} / {outputs.length} total</span>
            {outputs.map((item, itemIndex) => <button key={item.id} type="button" aria-label={`View output ${itemIndex + 1}`} aria-pressed={index === itemIndex} onClick={() => props.onOutputChange(itemIndex)} className={cn('h-10 w-10 shrink-0 overflow-hidden rounded-control border-2', index === itemIndex ? 'border-primary' : 'border-transparent')}><MediaFrame src={outputUrl(item)} kind={isVideoOutput(item) ? 'video' : 'image'} alt="" layout="thumb" /></button>)}
          </div>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy || props.reuseBlocked} onClick={() => props.onReuse(job)}>Use this configuration</Button>
            {active && <Button variant="danger-ghost" size="sm" disabled={busy || Boolean(job.cancelRequested) || props.pendingCancelId !== null} loading={props.pendingCancelId === job.id} onClick={() => props.onCancel(job.id)}>{job.cancelRequested ? 'Cancelling' : 'Cancel task'}</Button>}
            {job.status === 'failed' && <Button variant="secondary" size="sm" disabled={busy || props.pendingRetryId !== null} loading={props.pendingRetryId === job.id} onClick={() => props.onRetry(job.id)}>Retry original task</Button>}
            {output && job.status === 'succeeded' && <>
              {!video && <Button variant="secondary" size="sm" disabled={busy || Boolean(localEditReason)} onClick={() => props.onStartEdit(output)} icon={<CropIcon weight="bold" aria-hidden="true" />}>Local edit</Button>}
              <a href={output.downloadUrl || outputUrl(output)} download target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}><DownloadSimpleIcon weight="bold" aria-hidden="true" />{video ? 'Download video' : 'Download original image'}</a>
            </>}
          </div>
          {!video && output && localEditReason && <p className="text-xs text-muted-foreground">{localEditReason}</p>}
          {props.reuseBlocked && <p className="text-xs text-muted-foreground">Input images are uploading or being validated — you can use a historical configuration once they finish.</p>}
          {props.actionError && <p role="alert" className="text-xs text-danger">{props.actionError}</p>}
        </div>
      ) : null}
    </section>
  )
}
