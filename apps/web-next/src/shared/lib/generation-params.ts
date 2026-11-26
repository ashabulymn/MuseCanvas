// Staged input images: which roles a model accepts, in what positional order,
// and how the browser turns that plan into a request.
//
// The parameter-descriptor engine that used to live above this comment now sits
// in `media-parameters.ts`, and the value legality rules themselves live in
// `@musecanvas/contracts`. That is the point of the move: the browser no longer
// keeps a second, browser-only opinion about which sizes or qualities exist, so a
// rule can no longer be enforced by the API and contradicted here.

import type {
  GenerationInputItem,
  InputSlotDescriptor,
  ModelConfig,
  StagedReferenceImage,
} from '@/shared/types'
import { RUNTIME_SETTINGS_DEFAULTS, isVideoModel } from '@/shared/types'

const SLOT_ORDER: Record<string, number> = {
  first_frame: 0,
  last_frame: 1,
  reference_image: 2,
  // Masks sort last on purpose: they are a control channel attached to a base
  // image, not another picture the model looks at.
  mask: 3,
}

const ROLE_LABELS: Record<string, string> = {
  first_frame: 'First frame',
  last_frame: 'Last frame',
  reference_image: 'Reference image',
  prompt_image: 'Prompt image',
  source_video: 'Source video',
  mask: 'Selection mask',
}

/** Roles never renderable as staged images: the upload endpoint accepts only
 *  image/png and image/jpeg. */
const UNSUPPORTED_PLAN_ROLES = new Set<string>(['source_video'])

/** Effective input slots: descriptor slots win; otherwise derive from maxInputImages. */
export function resolveInputSlots(
  model: Pick<ModelConfig, 'inputSlots' | 'maxInputImages'> | null | undefined,
): InputSlotDescriptor[] {
  if (model?.inputSlots && model.inputSlots.length > 0) return model.inputSlots
  const max = model?.maxInputImages ?? 0
  if (max <= 0) return []
  return [{
    role: 'reference_image',
    required: false,
    minCount: 0,
    maxCount: max,
    allowedMediaKinds: ['image'],
  }]
}

/** Anything an input plan needs: a full model, or the legacy 2-key pick already
 *  used by the reference-image call sites (an absent `modelKind` reads as image). */
export type ImageInputPlanModel =
  Partial<Pick<ModelConfig, 'modelKind' | 'mediaKind'>> & Pick<ModelConfig, 'inputSlots' | 'maxInputImages'>

export interface ImageInputPlan {
  slots: InputSlotDescriptor[]
  capacity: number
  multiRole: boolean
}

/** Image-only view of a model's input slots: which roles may be staged, in what
 *  positional order, and how many files fit. */
export function resolveImageInputPlan(model: ImageInputPlanModel | null | undefined): ImageInputPlan {
  const videoKind = isVideoModel({
    modelKind: model?.modelKind ?? 'image',
    mediaKind: model?.mediaKind,
  })
  const slots = resolveInputSlots(model).filter((slot) => {
    if (slot.allowedMediaKinds.length > 0 && !slot.allowedMediaKinds.includes('image')) return false
    if (UNSUPPORTED_PLAN_ROLES.has(slot.role)) return false
    // Both video providers infer frame roles positionally, so mixing references
    // with first/last frames is not representable in either request shape.
    if (videoKind && slot.role === 'reference_image') return false
    return true
  })
  const ordered = [...slots].sort(
    (a, b) => (SLOT_ORDER[a.role] ?? Number.MAX_SAFE_INTEGER) - (SLOT_ORDER[b.role] ?? Number.MAX_SAFE_INTEGER),
  )
  const total = ordered.reduce((sum, slot) => sum + Math.max(0, slot.maxCount), 0)
  const capacity = Math.max(0, Math.min(total, RUNTIME_SETTINGS_DEFAULTS.maxInputs))
  return {
    slots: ordered,
    capacity,
    multiRole: new Set(ordered.map((slot) => slot.role)).size > 1,
  }
}

/** Positional role for every accepted slot: a slot with `maxCount: n` contributes
 *  n positions, so staged order alone decides roles. */
export function planRolePositions(plan: ImageInputPlan): string[] {
  const positions: string[] = []
  for (const slot of plan.slots) {
    const repeats = Math.max(0, slot.maxCount)
    for (let index = 0; index < repeats; index += 1) positions.push(slot.role)
  }
  return positions.slice(0, plan.capacity)
}

/** Staged images -> unified inputs[] with stable positions. A local upload and a
 *  gallery pick differ only in which reference they carry; nothing downstream needs to
 *  know where the image came from. */
export function buildGenerationInputs(
  staged: Pick<StagedReferenceImage, 'uploadId' | 'assetId' | 'status' | 'role'>[],
): GenerationInputItem[] {
  return staged
    .filter((img) => img.status === 'ready' && Boolean(img.uploadId || img.assetId))
    .map((img, index) => ({
      ...(img.uploadId ? { uploadId: img.uploadId } : { assetId: img.assetId as string }),
      role: (img.role || 'reference_image') as GenerationInputItem['role'],
      position: index,
    }))
}

/** First/last-frame constraints: at most one each; first must lead, last must trail. */
export function firstLastFrameViolations(
  staged: Pick<StagedReferenceImage, 'role'>[],
  plan?: ImageInputPlan | null,
): string[] {
  const errors: string[] = []
  const firstIdx: number[] = []
  const lastIdx: number[] = []
  staged.forEach((img, i) => {
    if (img.role === 'first_frame') firstIdx.push(i)
    if (img.role === 'last_frame') lastIdx.push(i)
  })
  if (firstIdx.length > 1) errors.push('Only one first-frame image can be set')
  if (lastIdx.length > 1) errors.push('Only one last-frame image can be set')
  if (firstIdx.length === 1 && firstIdx[0] !== 0) errors.push('The first-frame image must be in the first position')
  if (lastIdx.length === 1 && lastIdx[0] !== staged.length - 1) errors.push('The last-frame image must be in the last position')
  if (firstIdx.length === 1 && lastIdx.length === 1 && staged.length < 2) {
    errors.push('The first and last frames cannot be the same image')
  }
  if (lastIdx.length > 0 && firstIdx.length === 0) errors.push('Set a first frame before setting a last frame')
  if (plan) errors.push(...roleCountViolations(staged, plan))
  return errors
}

function roleCountViolations(
  staged: Pick<StagedReferenceImage, 'role'>[],
  plan: ImageInputPlan,
): string[] {
  const errors: string[] = []
  const counts = new Map<string, number>()
  for (const img of staged) {
    if (!img.role) continue
    counts.set(img.role, (counts.get(img.role) ?? 0) + 1)
  }
  for (const [role, count] of counts) {
    const slot = plan.slots.find((candidate) => candidate.role === role)
    const label = slot?.label ?? ROLE_LABELS[role] ?? role
    if (!slot) {
      errors.push(`The current model does not support ${label} — remove that image`)
      continue
    }
    // A single first/last frame is already covered by the dedicated rules above.
    if ((role === 'first_frame' || role === 'last_frame') && slot.maxCount <= 1) continue
    if (count > slot.maxCount) errors.push(`${label} allows at most ${slot.maxCount} image${slot.maxCount === 1 ? '' : 's'} (currently ${count})`)
  }
  return errors
}

/** Everything that blocks submission for the staged images under a plan. */
export function inputPlanViolations(
  staged: Pick<StagedReferenceImage, 'role'>[],
  plan: ImageInputPlan,
): string[] {
  const errors: string[] = []
  if (staged.length > plan.capacity) {
    errors.push(
      plan.capacity === 0
        ? 'The current model does not support input images — switch to a model that supports image input'
        : `The current model accepts at most ${plan.capacity} input image${plan.capacity === 1 ? '' : 's'} (${staged.length} staged)`,
    )
  }
  for (const message of firstLastFrameViolations(staged, plan)) errors.push(message)
  return [...new Set(errors)]
}
