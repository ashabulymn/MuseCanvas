import { canonicalNameOf, reconcileModelParameters } from '../../../shared/lib/media-parameters'
import type { ParameterState } from '../../../shared/lib/media-parameters'
import { isVideoOutput, modelMediaKind } from '../../../shared/types'
import type { GenerateModeTab, GenerationJob, ModelConfig } from '../../../shared/types'

export interface JobConfigReuse {
  prompt: string
  tab: GenerateModeTab
  model: ModelConfig | null
  parameters: ParameterState
  notices: string[]
}

/** Restore a draft, never a submitted request or a historical edit selection. */
export function buildJobConfigReuse(job: GenerationJob, models: ModelConfig[]): JobConfigReuse {
  const tab: GenerateModeTab = job.mediaKind === 'video'
    || (job.mediaKind == null && job.outputs.some(isVideoOutput)) ? 'video' : 'image'
  const model = models.find((entry) => entry.id === job.modelId && modelMediaKind(entry) === tab) ?? null
  const notices = ['Reference images and the edit selection were not restored; check before generating.']
  if (job.inputs?.length || job.inputImages?.length) {
    notices.push('This historical task contains input images. Re-add the reference images or input frames you need.')
  }
  if (!model) {
    notices.push('The historical model is currently unavailable, so only the prompt can be used. Choose an available model yourself.')
    return { prompt: job.inputPrompt ?? job.prompt, tab, model: null, parameters: {}, notices }
  }

  const raw = job.parameters ?? {
    ...(job.size != null ? { size: job.size } : {}),
    ...(job.quality != null ? { quality: job.quality } : {}),
    ...(job.count != null ? { count: job.count } : {}),
  }
  const values: ParameterState = {}
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) {
      values[canonicalNameOf({ name })] = value
    }
  }
  const parameters = reconcileModelParameters(model, values)
  const dropped = Object.keys(raw).filter((name) => !(canonicalNameOf({ name }) in parameters))
  if (dropped.length > 0) notices.push(`Incompatible parameters were not restored: ${dropped.join(', ')}; using the current model defaults.`)
  if (!job.parameters) notices.push('The old task did not record complete parameters; only verifiable values were restored, the rest use the current model defaults.')
  return { prompt: job.inputPrompt ?? job.prompt, tab, model, parameters, notices }
}
