'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import { useRouter,
  useSearchParams } from 'next/navigation'
import { editSelectionIsUsable } from '@musecanvas/contracts'
import { useGenerateUiStore } from '@/shared/stores/generate-ui-store'
import { useModelsQuery } from '@/shared/hooks/useModels'
import { useJobsQuery,
  useCreateJob,
  useCancelJob,
  useRetryJob } from '@/shared/hooks/useJobs'
import { useCreateImageEdit } from '../lib/use-image-edit'
import { maskCapabilityBlockReason,
  modelAcceptsMask } from '@/shared/lib/model-capabilities'
import {
  buildGenerationInputs,
  inputPlanViolations,
  resolveImageInputPlan,
  } from '@/shared/lib/generation-params'
import {
  buildMediaParameters,
  canonicalNameOf,
  descriptorLabel,
  parameterIssues,
  reconcileModelParameters,
  } from '@/shared/lib/media-parameters'
import { clearReferenceImages,
  reconcileStagedRoles } from '@/shared/lib/reference-upload'
import { GENERATE_ROUTE } from '@/shared/lib/app-routes'
import { Alert, Button, Dialog } from '@/shared/components/ui'
import { isJobActive } from '@/shared/lib/job-status'
import { modelMediaKind, outputUrl } from '@/shared/types'
import type { CreateGenerationRequest, GenerateModeTab, GenerationJob, GenerationOutput } from '@/shared/types'
import { GenerationStage } from './generation-stage'
import { GenerationComposer } from './generation-composer'
import { GenerationTaskPanel } from './generation-task-panel'
import { buildJobConfigReuse } from '../lib/job-config-reuse'

/** `?tab=` accepts only the two kinds; anything else (typo, stale bookmark) is image. */
function readTabParam(value: string | null): GenerateModeTab {
  return value === 'video' ? 'video' : 'image'
}

/** One key per submit *attempt*, so a double-fired request collapses into one job
 *  on the server while a deliberate resubmit after a failure is a new job. */
function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function GenerateConsole() {
  const prompt = useGenerateUiStore((s) => s.prompt)
  const submissionBusy = useGenerateUiStore((s) => s.isGenerating)
  const activeTab = useGenerateUiStore((s) => s.activeTab)
  const selectedModelIdByKind = useGenerateUiStore((s) => s.selectedModelIdByKind)
  const paramsByKind = useGenerateUiStore((s) => s.paramsByKind)
  const selectedJobId = useGenerateUiStore((s) => s.selectedJobId)
  // One object reference, so a staged-upload progress tick (which rewrites
  // `stagedImages`, never this) cannot re-render the console out of edit mode.
  const editTarget = useGenerateUiStore((s) => s.editTarget)
  const stagedOrder = useGenerateUiStore((s) =>
    s.stagedImages.map((image) => image.localId).join('|'),
  )
  const setPrompt = useGenerateUiStore((s) => s.setPrompt)
  const setActiveTab = useGenerateUiStore((s) => s.setActiveTab)
  const setSelectedModelId = useGenerateUiStore((s) => s.setSelectedModelId)
  const setParam = useGenerateUiStore((s) => s.setParam)
  const replaceParams = useGenerateUiStore((s) => s.replaceParams)
  const setSelectedJobId = useGenerateUiStore((s) => s.setSelectedJobId)
  const setEditTarget = useGenerateUiStore((s) => s.setEditTarget)
  const setEditSelection = useGenerateUiStore((s) => s.setEditSelection)
  // Derived primitives, so upload progress ticks never re-render this console.
  const isPreparingReferences = useGenerateUiStore((s) => s.isPreparingReferences)
  const isReferenceUploadBusy = useGenerateUiStore((s) =>
    s.stagedImages.some((image) => image.status === 'pending' || image.status === 'uploading' || image.status === 'processing'),
  )
  const hasReferenceUploadError = useGenerateUiStore((s) =>
    s.stagedImages.some((image) => image.status === 'error'),
  )

  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    data: models,
    isLoading: modelsLoading,
    isError: modelsQueryFailed,
    error: modelsQueryError,
    refetch: refetchModels,
  } = useModelsQuery()
  const {
    data: jobs = [],
    isLoading: jobsLoading,
    isError: jobsError,
    refetch: refetchJobs,
  } = useJobsQuery(30)

  const createJobMutation = useCreateJob()
  const cancelJobMutation = useCancelJob()
  const retryJobMutation = useRetryJob()
  const editMutation = useCreateImageEdit()

  const composerExpanded = useGenerateUiStore((s) => s.composerExpanded)
  const setComposerExpanded = useGenerateUiStore((s) => s.setComposerExpanded)
  const activeOutputIndex = useGenerateUiStore((s) => s.activeOutputIndex)
  const setActiveOutputIndex = useGenerateUiStore((s) => s.setActiveOutputIndex)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [reuseJob, setReuseJob] = useState<GenerationJob | null>(null)
  const [exampleText, setExampleText] = useState<string | null>(null)
  const [editOutput, setEditOutput] = useState<GenerationOutput | null>(null)
  const [editInstruction, setEditInstruction] = useState('')
  const [draftNotice, setDraftNotice] = useState('')
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})
  const reuseConfig = useMemo(() => reuseJob ? buildJobConfigReuse(reuseJob, models ?? []) : null, [reuseJob, models])
  const reuseBlocked = isPreparingReferences || isReferenceUploadBusy
  useEffect(() => {
    if (!submissionBusy) return
    setReuseJob(null)
    setExampleText(null)
    setEditOutput(null)
  }, [submissionBusy])

  const [errorMessage, setErrorMessage] = useState('')
  // The last `?tab=` value this mount has already honoured. A `tab`-less URL
  // never lands here, so this only ever holds `undefined` or a string.
  const consumedTabParamRef = useRef<string | undefined>(undefined)

  // GET /api/models returns image AND video models: each tab may only drive its
  // own kind, otherwise a video model gets auto-selected into the image flow.
  const imageModels = useMemo(
    () => (models ?? []).filter((model) => modelMediaKind(model) !== 'video'),
    [models],
  )
  const videoModels = useMemo(
    () => (models ?? []).filter((model) => modelMediaKind(model) === 'video'),
    [models],
  )
  const isVideoTab = activeTab === 'video'
  // Deprecated models sort last. The first entry is what a fresh session falls
  // back to, so a vendor-retired model must never occupy the recommended slot;
  // within each group the admin's own `sort_order` still decides, because this
  // is a presentation rule and not a re-ranking of the catalogue.
  const tabModels = useMemo(() => {
    const list = isVideoTab ? videoModels : imageModels
    return [...list].sort((left, right) => Number(left.deprecated === true) - Number(right.deprecated === true))
  }, [isVideoTab, videoModels, imageModels])

  const storedModelId = selectedModelIdByKind[activeTab]
  // Same id and still offered -> keep it; otherwise fall back to the first model
  // of *this* kind. Never across kinds.
  const activeModelId = tabModels.some((model) => model.id === storedModelId)
    ? storedModelId
    : tabModels[0]?.id ?? ''
  const currentModel = tabModels.find((model) => model.id === activeModelId)
  const params = paramsByKind[activeTab]
  const inputPlan = useMemo(() => resolveImageInputPlan(currentModel), [currentModel])
  const referencePlanBlocker = useGenerateUiStore((s) =>
    s.stagedImages.length > 0 ? inputPlanViolations(s.stagedImages, inputPlan)[0] ?? null : null,
  )
  // Computed, never stored: this runs the same validator the API runs, so an
  // enabled submit button and an acceptable request are the same claim rather
  // than two lists that can disagree.
  const parameterProblems = useMemo(() => parameterIssues(currentModel, params), [currentModel, params])
  // One noun for the staged-image surface: frame slots stop calling them references.
  const inputNoun = inputPlan.slots.some(
    (slot) => slot.role === 'first_frame' || slot.role === 'last_frame',
  )
    ? 'input frames'
    : 'reference images'

  /**
   * `?tab=` is a one-shot deep link into the mode, not a record of it: the
   * header owns switching now and writes the store directly.
   *
   * Two details make that safe. The guard is keyed on the consumed *raw value*
   * rather than "the mode we last applied", and `activeTab` stays out of the
   * dependency list — otherwise clicking 作图 while the URL still said
   * `tab=video` would be bounced straight back to video. And once consumed, the
   * param is dropped: a bookmark that keeps saying `video` after the user chose
   * 作图 would resurrect video on the next reload.
   */
  useEffect(() => {
    const raw = searchParams.get('tab')
    if (raw === null) return
    if (consumedTabParamRef.current === raw) return
    consumedTabParamRef.current = raw
    setActiveTab(readTabParam(raw))
    router.replace(GENERATE_ROUTE, { scroll: false })
  }, [router, searchParams, setActiveTab])

  // Persist the resolved fallback so an admin rename/removal cannot silently
  // jump the selection mid-session. Writing it is what ends the loop: the next
  // run sees `storedModelId === activeModelId` and returns.
  useEffect(() => {
    if (!activeModelId) return
    if (storedModelId === activeModelId) return
    setSelectedModelId(activeTab, activeModelId)
  }, [activeTab, activeModelId, storedModelId, setSelectedModelId])

  // Reconcile the parameter picks whenever the selected model changes: anything
  // the new contract does not accept is dropped, so the controls on screen agree
  // with the request about to be built. The sparse map handles a *missing* value
  // (absent key means descriptor default) but not a *stale* one, and without this
  // a `quality=max` chosen on a 2.5 model would still be sent after switching to
  // a model that has no such rung.
  //
  // Idempotent by construction — once the map is reconciled the comparison below
  // holds and nothing is written again, so this cannot cycle.
  useEffect(() => {
    if (!currentModel) return
    const previous = paramsByKind[activeTab]
    const reconciled = reconcileModelParameters(currentModel, previous)
    const entries = Object.entries(reconciled)
    const unchanged = entries.length === Object.keys(previous).length
      && entries.every(([key, value]) => previous[key] === value)
    if (unchanged) return
    replaceParams(activeTab, reconciled)
  }, [currentModel, activeTab, paramsByKind, replaceParams])

  // Frame roles are positional, so every staging change (add / remove / reorder /
  // model or tab switch) re-derives them. `stagedOrder` is a joined string and the
  // reconciliation itself is a no-op once the roles match, so this cannot cycle.
  useEffect(() => {
    if (!stagedOrder) return
    void reconcileStagedRoles(currentModel)
  }, [stagedOrder, currentModel])

  // Find currently selected or running job
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0] || null
  const editing = activeTab === 'image' && editTarget !== null
  // Computed, never stored: an incapable model is refused at both entry points *and*
  // at submit, and a request is never downgraded to a whole-image edit.
  const maskCapable = modelAcceptsMask(currentModel)
  const maskBlockedReason = maskCapabilityBlockReason(currentModel)
  const editSelectionReady = editSelectionIsUsable(editTarget?.selection ?? null)
  // The descriptor set an edit can actually be built from. `POST /api/images/edit`
  // carries `modelId`, `prompt`, `quality` and the region — no `size` (the server
  // derives the output size from the source image's own aspect ratio) and no
  // `count` (one picture comes back). Offering either would be a choice the request
  // cannot express, and narrowing here also makes `editParameterProblems` validate
  // exactly the controls still on screen.
  const editModelContract = useMemo(() => {
    if (!currentModel) return null
    return {
      ...currentModel,
      parameters: (currentModel.parameters ?? []).filter(
        (descriptor) => descriptor.type !== 'image-size' && canonicalNameOf(descriptor) !== 'count',
      ),
    }
  }, [currentModel])
  const editParameterProblems = useMemo(
    () => parameterIssues(editModelContract, params),
    [editModelContract, params],
  )
  // One pass over the submit gate, so a disabled button always carries a reason the
  // user can read instead of a control that simply refuses to respond.
  function editSubmitBlocker(): string | null {
    if (!editing) return null
    if (!prompt.trim()) return 'Enter the edit instruction'
    if (!maskCapable) return maskBlockedReason
    if (!editSelectionReady) return 'Select the area to edit on the image first'
    if (editParameterProblems.length > 0) return editParameterProblems[0].message
    if (submissionBusy) return 'Submitting the task, please wait'
    return null
  }
  const editBlockedReason = editSubmitBlocker()

  function generateSubmitBlocker(): string | null {
    if (modelsLoading) return 'Loading models, please wait'
    if (modelsQueryFailed && !models) return 'The model list failed to load. Please try again.'
    if (!currentModel) {
      return isVideoTab
        ? 'No video model is configured yet. Enable a video model first.'
        : 'No image model is configured yet. Contact an administrator.'
    }
    if (!prompt.trim()) return 'Enter a prompt to generate'
    if (createJobMutation.isPending) return 'Creating the task, please wait'
    if (submissionBusy) return 'Submitting the task, please wait'
    if (isPreparingReferences) return `Validating ${inputNoun} — finish before generating`
    if (isReferenceUploadBusy) return `${inputNoun} are uploading — wait until they finish before generating`
    if (hasReferenceUploadError) return `Some ${inputNoun} failed to upload — retry or remove them`
    if (referencePlanBlocker) return referencePlanBlocker
    if (parameterProblems.length > 0) {
      const [problem] = parameterProblems
      const descriptor = currentModel?.parameters?.find((entry) => entry.name === problem.parameter)
      const label = descriptor ? descriptorLabel(descriptor, currentModel) : ''
      return label ? `${label}: ${problem.message}` : problem.message
    }
    return null
  }
  const submitBlockedReason = editing
    ? editMutation.isPending
      ? 'Submitting the local edit, please wait'
      : editBlockedReason
    : generateSubmitBlocker()

  // Escape belongs to the focused editor or dialog, never the background draft.
  function taskAction(kind: 'cancel' | 'retry', jobId: string) {
    if (useGenerateUiStore.getState().isGenerating) return
    const mutation = kind === 'cancel' ? cancelJobMutation : retryJobMutation
    if (mutation.isPending) return
    setActionErrors((current) => { const next = { ...current }; delete next[jobId]; return next })
    mutation.mutate(jobId, {
      onError: (error) => setActionErrors((current) => ({ ...current, [jobId]: `${kind === 'cancel' ? 'Cancel' : 'Retry'} failed: ${error.message}` })),
    })
  }

  const boardProps = {
    jobs,
    isLoading: jobsLoading,
    isError: jobsError,
    onReload: () => void refetchJobs(),
    selectedJobId: selectedJob?.id ?? null,
    onSelectJob: selectJob,
    onCancel: (jobId: string) => taskAction('cancel', jobId),
    onRetry: (jobId: string) => taskAction('retry', jobId),
    pendingCancelId: cancelJobMutation.isPending ? (cancelJobMutation.variables ?? null) : null,
    pendingRetryId: retryJobMutation.isPending ? (retryJobMutation.variables ?? null) : null,
  }

  /** Picking another job ends the edit: the stage would otherwise keep showing a
   *  picture that is no longer what the console is looking at. */
  function selectJob(jobId: string) {
    if (useGenerateUiStore.getState().isGenerating) return
    setSelectedJobId(jobId)
    setEditTarget(null)
  }

  function startRegionEdit(output: GenerationOutput) {
    if (useGenerateUiStore.getState().isGenerating || !output.assetId || !maskCapable) return
    setEditInstruction(prompt)
    setEditOutput(output)
  }

  function confirmRegionEdit() {
    if (!editOutput || useGenerateUiStore.getState().isGenerating || !maskCapable) return
    setActiveTab('image')
    setPrompt(editInstruction)
    setEditTarget({
      assetId: editOutput.assetId,
      url: outputUrl(editOutput),
      width: editOutput.metadata.width,
      height: editOutput.metadata.height,
      selection: null,
    })
    setEditOutput(null)
    setComposerExpanded(true)
    setErrorMessage('')
    // Editing instructions are rendered from the live mode by the composer;
    // do not retain an "entered edit" notice after success/exit.
    setDraftNotice('')
  }

  function useExample(text: string) {
    if (useGenerateUiStore.getState().isGenerating) return
    if (prompt.trim()) setExampleText(text)
    else { setPrompt(text); setComposerExpanded(true) }
  }

  function confirmReuse() {
    const state = useGenerateUiStore.getState()
    if (!reuseConfig || state.isGenerating || state.isPreparingReferences || state.stagedImages.some((image) => image.status !== 'ready' && image.status !== 'error')) return
    // Cleanup snapshots and empties inputs synchronously before remote deletion
    // awaits; apply the confirmed draft in this turn, not after async cleanup.
    const cleanup = clearReferenceImages()
    setEditTarget(null)
    setPrompt(reuseConfig.prompt)
    if (reuseConfig.model) {
      setActiveTab(reuseConfig.tab)
      setSelectedModelId(reuseConfig.tab, reuseConfig.model.id)
      replaceParams(reuseConfig.tab, reuseConfig.parameters)
    }
    setDraftNotice(reuseConfig.notices.join(' '))
    setErrorMessage('')
    setReuseJob(null)
    setComposerExpanded(true)
    void cleanup.catch((error: unknown) => setErrorMessage(`Draft loaded, but clearing the old inputs failed: ${error instanceof Error ? error.message : 'Please try again later'}`))
  }

  async function handleSubmitEdit() {
    if (!editTarget || !activeModelId) {
      setErrorMessage('Select a generation model')
      return
    }
    // Read here rather than from the derived flag, so the narrowing below is the
    // same predicate the button used and cannot have drifted from it.
    const selection = editTarget.selection
    if (!editSelectionIsUsable(selection)) {
      setErrorMessage('Select the area to edit on the image first')
      return
    }
    if (!maskCapable) {
      setErrorMessage(maskBlockedReason ?? 'This model does not support local edits')
      return
    }
    if (editParameterProblems.length > 0) {
      const [problem] = editParameterProblems
      const parameters = editModelContract?.parameters ?? []
      const descriptor = parameters.find((entry) => entry.name === problem.parameter)
      const label = descriptor ? descriptorLabel(descriptor, editModelContract) : ''
      setErrorMessage(label ? `${label}: ${problem.message}` : problem.message)
      return
    }
    setErrorMessage('')
    // Every control the model declares and this screen still shows rides along in
    // the `parameters` bag — dropping one here would leave a picker the user can
    // set to no effect. `size` and `count` are excluded by `editModelContract`
    // above, because this route derives the size from the source image and returns
    // one picture; the server overrides either anyway.
    try {
      await editMutation.mutateAsync({
        modelId: activeModelId,
        prompt: prompt.trim(),
        assetId: editTarget.assetId,
        selection,
        idempotencyKey: newIdempotencyKey(),
        parameters: buildMediaParameters(editModelContract, params),
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create the local edit task')
    }
  }

  async function handleGenerate(e?: React.FormEvent) {
    e?.preventDefault()
    // Synchronous store acquisition also covers two events before React rerenders.
    const store = useGenerateUiStore.getState()
    if (!store.tryBeginSubmission()) return
    try {
      await performGenerate()
    } finally {
      store.finishSubmission()
    }
  }

  async function performGenerate() {
    if (editing) {
      await handleSubmitEdit()
      return
    }
    const video = activeTab === 'video'
    if (!prompt.trim()) {
      setErrorMessage(video ? 'Enter a video generation prompt' : 'Enter an image prompt')
      return
    }
    if (!activeModelId) {
      setErrorMessage(video ? 'Select a video generation model' : 'Select a generation model')
      return
    }
    if (video && videoModels.length === 0) {
      setErrorMessage('No video model is configured yet. Enable the Seedance or Veo preset under Media models first.')
      return
    }

    // Read the snapshot imperatively so the gate can never be evaluated from a
    // stale render of an upload that finished between render and click.
    const inputState = useGenerateUiStore.getState()
    const stagedImages = inputState.stagedImages
    if (inputState.isPreparingReferences) {
      setErrorMessage(`Validating ${inputNoun} — finish before generating`)
      return
    }
    if (stagedImages.some((image) => image.status !== 'ready' && image.status !== 'error')) {
      setErrorMessage(`${inputNoun} are uploading — wait until they finish before generating`)
      return
    }
    if (stagedImages.some((image) => image.status === 'error')) {
      setErrorMessage(`Some ${inputNoun} failed to upload — retry or remove them`)
      return
    }
    const inputs = buildGenerationInputs(stagedImages)
    if (stagedImages.length > 0 && inputs.length === 0) {
      setErrorMessage(`No usable ${inputNoun} — please re-upload`)
      return
    }
    // Only validate the input capability when images are actually staged: a model
    // without image inputs must still support its ordinary text-to-image flow.
    // This also catches stale references after switching to a model with a smaller
    // or incompatible input contract, for both image and video generation.
    if (stagedImages.length > 0) {
      const violations = inputPlanViolations(stagedImages, inputPlan)
      if (violations.length > 0) {
        setErrorMessage(violations[0])
        return
      }
    }
    // Block here rather than letting the server refuse it: an invalid custom
    // size or a transparent-background-plus-jpeg pair should be explained while
    // the user is still looking at the control, not after a job row exists.
    // This is UX only — the API runs the identical check and is the authority.
    if (parameterProblems.length > 0) {
      const [problem] = parameterProblems
      const descriptor = currentModel?.parameters?.find((entry) => entry.name === problem.parameter)
      const label = descriptor ? descriptorLabel(descriptor, currentModel) : ''
      setErrorMessage(label ? `${label}: ${problem.message}` : problem.message)
      return
    }
    setErrorMessage('')

    try {
      // One builder for both kinds. It walks the model's declared descriptors, so
      // a parameter this model never offered cannot be sent even if it is still
      // sitting in the tab's state from the model that was selected a moment ago.
      const payload: CreateGenerationRequest = {
        modelId: activeModelId,
        prompt: prompt.trim(),
        parameters: buildMediaParameters(currentModel, params),
        idempotencyKey: newIdempotencyKey(),
        ...(inputs.length > 0 ? { inputs } : {}),
      }
      const job = await createJobMutation.mutateAsync(payload)
      setSelectedJobId(job.id)
      // The uploads are now attached to the job; only release local object URLs.
      await clearReferenceImages({ deleteRemote: false })
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create the generation task')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!submitBlockedReason) handleGenerate()
    }
  }

  const modelStatus = modelsLoading ? 'Loading model list…'
    : modelsQueryFailed ? models ? 'The model list failed to refresh, but the loaded models are still usable.' : `Model list failed to load: ${modelsQueryError instanceof Error ? modelsQueryError.message : 'Please try again'}`
      : !currentModel ? `No ${isVideoTab ? 'video' : 'image'} model is configured yet.` : null

  return (
    <div role="region" aria-label="Creation console" className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden p-3 md:p-5">
      <GenerationStage
        tab={activeTab} job={selectedJob} loading={jobsLoading} queryFailed={jobsError}
        onReload={() => void refetchJobs()} activeCount={jobs.filter(isJobActive).length} onOpenTasks={() => setTasksOpen(true)}
        outputIndex={activeOutputIndex} onOutputChange={setActiveOutputIndex}
        editTarget={editing ? editTarget : null} onSelectionChange={setEditSelection}
        onExitEdit={() => { if (!useGenerateUiStore.getState().isGenerating) setEditTarget(null) }}
        onStartEdit={startRegionEdit} editBlockedReason={maskBlockedReason} busy={submissionBusy}
        modelAvailable={Boolean(currentModel)} onExample={useExample}
        onReuse={(job) => { if (!useGenerateUiStore.getState().isGenerating && !reuseBlocked) setReuseJob(job) }} reuseBlocked={reuseBlocked}
        onCancel={boardProps.onCancel} onRetry={boardProps.onRetry}
        pendingCancelId={boardProps.pendingCancelId} pendingRetryId={boardProps.pendingRetryId}
        actionError={selectedJob ? actionErrors[selectedJob.id] : undefined}
      />
      <GenerationComposer
        prompt={prompt} onPromptChange={setPrompt} onKeyDown={handleKeyDown} tab={activeTab} editing={editing}
        expanded={composerExpanded} onExpandedChange={setComposerExpanded} busy={submissionBusy}
        models={tabModels} modelId={activeModelId} model={currentModel} parameterModel={editing ? editModelContract : currentModel}
        values={params} onModelChange={(id) => setSelectedModelId(activeTab, id)} onParameterChange={(name, value) => setParam(activeTab, name, value)}
        modelsLoading={modelsLoading} modelStatus={modelStatus} modelsFailed={modelsQueryFailed} onReloadModels={() => void refetchModels()}
        inputPlan={inputPlan} blockedReason={submitBlockedReason} error={errorMessage} notice={draftNotice} onSubmit={() => void handleGenerate()}
      />
      <GenerationTaskPanel {...boardProps} open={tasksOpen} onClose={() => setTasksOpen(false)} busy={submissionBusy} actionErrors={actionErrors} />
      <Dialog open={Boolean(reuseConfig) && !submissionBusy} onClose={() => setReuseJob(null)} title="Use this configuration" size="wide" description="This will replace the current prompt, exit local edit, and clear staged inputs. It will not submit the task automatically." footer={<><Button variant="secondary" onClick={() => setReuseJob(null)}>Keep current draft</Button><Button variant="primary" disabled={submissionBusy || reuseBlocked} onClick={confirmReuse}>{reuseConfig?.model ? 'Confirm and load configuration' : 'Use prompt only'}</Button></>}>
        {reuseConfig && <div className="flex flex-col gap-3">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{reuseConfig.prompt}</p>
          <p className="text-xs text-muted-foreground">{reuseConfig.model ? `Model: ${reuseConfig.model.displayName}` : 'The historical model is unavailable: only the text is replaced — the mode, model, and parameters stay unchanged. Choose a model yourself.'}</p>
          {reuseConfig.notices.map((notice) => <Alert key={notice} tone="warning">{notice}</Alert>)}
          {reuseBlocked && <p role="status" className="text-xs text-muted-foreground">Input images are uploading or being validated — please wait until they finish.</p>}
        </div>}
      </Dialog>
      <Dialog open={exampleText !== null && !submissionBusy} onClose={() => setExampleText(null)} title="Replace the current prompt?" description="The example only replaces the text — the model, parameters, and reference images stay unchanged. It will not submit automatically." footer={<><Button variant="secondary" onClick={() => setExampleText(null)}>Keep draft</Button><Button variant="primary" disabled={submissionBusy} onClick={() => { if (exampleText !== null && !useGenerateUiStore.getState().isGenerating) { setPrompt(exampleText); setExampleText(null); setComposerExpanded(true) } }}>Use example</Button></>}>
        <p className="whitespace-pre-wrap break-words text-sm">{exampleText}</p>
      </Dialog>
      <Dialog open={editOutput !== null && !submissionBusy} onClose={() => setEditOutput(null)} title="Prepare a local edit" size="wide" description="The original draft text is kept below. Describe what to change in the selected area; confirming only updates the draft and does not submit." footer={<><Button variant="secondary" onClick={() => setEditOutput(null)}>Keep original draft</Button><Button variant="primary" disabled={submissionBusy || !maskCapable} onClick={confirmRegionEdit}>Confirm instruction and enter</Button></>}>
        <label htmlFor="edit-instruction-draft" className="text-xs text-muted-foreground">Edit instruction (e.g. Change the selected area to a red trench coat, keep everything else unchanged)</label>
        <textarea id="edit-instruction-draft" rows={4} value={editInstruction} disabled={submissionBusy} onChange={(event) => setEditInstruction(event.target.value)} className="mt-2 w-full rounded-control border border-border-control bg-transparent p-3 text-sm" />
        <p className="mt-2 text-xs text-muted-foreground">Reference images are kept, but local edit only uses the source image and the selection. Select an area first after entering.</p>
      </Dialog>
    </div>
  )
}
