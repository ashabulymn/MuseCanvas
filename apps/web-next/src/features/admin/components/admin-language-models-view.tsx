'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { AdminModel, ModelPreset, ProviderCredential, ReasoningEffort } from '@/shared/types'
import { credentialsForPreset, isCustomCredential } from '../lib/provider-templates'
import { requireAdminData } from '../lib/admin-query'
import { AdminQueryFeedback } from './admin-query-feedback'
import { AdminCredentialTable } from './admin-credential-table'
import { AdminProviderCredentialDialog } from './admin-provider-credential-dialog'
import { AdminInstalledPlugins } from './admin-installed-plugins'
import { AdminActionErrors } from './admin-confirm-dialog'
import { useAdminActions } from '../lib/use-admin-actions'
import { resolveAdminConcurrency } from '../lib/admin-settings-state'
import { AdminMobileRecords, AdminRecordDetailDialog, AdminRecordFields } from './admin-record-detail-dialog'
import { PlusIcon as Plus, ArrowClockwiseIcon as RefreshCw, TrashIcon as Trash2 } from '@phosphor-icons/react'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FieldGroup,
  FormField,
  IconButton,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  SkeletonText,
  SkeletonTile,
  Switch,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TableSkeletonRow,
  TableStateRow,
} from '@/shared/components/ui'

const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: 'none', label: 'No thinking (none)' },
  { value: 'low', label: 'Low (low)' },
  { value: 'medium', label: 'Medium (medium)' },
  { value: 'high', label: 'High (high)' },
  { value: 'xhigh', label: 'Very high (xhigh)' },
]

const REASONING_EFFORT_LABEL: Record<string, string> = {
  none: 'No thinking',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Very high',
}

export function AdminLanguageModelsView() {
  const queryClient = useQueryClient()
  const recordListRef = useRef<HTMLDivElement | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium')
  const [concurrencyLimit, setConcurrencyLimit] = useState('2')
  const concurrencyValidation = resolveAdminConcurrency(concurrencyLimit)
  const [actionError, setActionError] = useState('')
  const [detailModel, setDetailModel] = useState<AdminModel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminModel | null>(null)
  const actions = useAdminActions()

  const {
    data: modelsData,
    isLoading: modelsLoading,
    isError: modelsError,
    error: modelsQueryError,
    refetch: refetchModels,
  } = useQuery({
    queryKey: ['admin', 'models'],
    queryFn: async () => {
      const res = await api<AdminModel[]>(API_ENDPOINTS.admin.models)
      return requireAdminData(res, 'Failed to load model list')
    },
  })

  const { data: presetsData, error: presetsError, refetch: refetchPresets } = useQuery({
    queryKey: ['admin', 'model-presets'],
    queryFn: async () => {
      const res = await api<ModelPreset[]>(API_ENDPOINTS.admin.modelPresets)
      return requireAdminData(res, 'Failed to load model presets')
    },
  })

  const {
    data: credentialsData,
    isLoading: credentialsLoading,
    isError: credentialsError,
    error: credentialsQueryError,
    refetch: refetchCredentials,
  } = useQuery({
    queryKey: ['admin', 'provider-credentials'],
    queryFn: async () => {
      const res = await api<ProviderCredential[]>(API_ENDPOINTS.admin.providerCredentials)
      return requireAdminData(res, 'Failed to load credential list')
    },
    // Connectivity tests settle in the worker; poll only while one is open.
    refetchInterval: (query) => (query.state.data?.some((c) => c.lastTestStatus === 'pending') ? 2000 : false),
  })

  const allModels = modelsData ?? []
  const allPresets = presetsData ?? []
  const allCredentials = credentialsData ?? []

  // This page is language-model only: rows and presets are scoped by kind, and
  // credentials are scoped to the plugin-less (adapter + API key) shape that
  // language presets bind through `credentialsForPreset`.
  const models = allModels.filter((m) => m.modelKind === 'language')
  const presets = allPresets.filter((p) => p.modelKind === 'language')
  const credentials = allCredentials.filter(isCustomCredential)

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) || null
  const matchingCredentials = credentialsForPreset(credentials, selectedPreset)
  const selectedCredentialMissing = !selectedCredentialId

  // Catalog invalidation may remove the selected plugin preset or its binding.
  // Failed refreshes retain the selection; only successful catalog data can clear it.
  const presetUnavailable = !!selectedPresetId && presetsData !== undefined && !presetsError && !selectedPreset
  const credentialUnavailable = !!selectedCredentialId && credentialsData !== undefined && !credentialsQueryError && !!selectedPreset && !matchingCredentials.some((credential) => credential.id === selectedCredentialId)
  useEffect(() => {
    if (presetUnavailable) {
      setSelectedPresetId('')
      setSelectedCredentialId('')
      setActionError('The selected preset is no longer in the current available directory (the plugin may have been disabled or deleted); the selection has been cleared. Please select a preset again.')
    } else if (credentialUnavailable) {
      setSelectedCredentialId('')
      setActionError('The selected credential is no longer available or no longer matches the current preset; the selection has been cleared. Please select a credential again.')
    }
  }, [presetUnavailable, credentialUnavailable])

  // Credential usage across every model kind: a plugin-less credential may also
  // back a legacy image/video row, so the table reports all bindings.
  const linkedModelsByCredential: Record<string, string[]> = {}
  for (const m of allModels) {
    if (!m.providerCredentialId) continue
    const list = linkedModelsByCredential[m.providerCredentialId] || []
    list.push(m.displayName)
    linkedModelsByCredential[m.providerCredentialId] = list
  }

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await api(API_ENDPOINTS.admin.model(id), {
        method: 'PATCH',
        body: { enabled },
      })
      if (!res.success) throw new Error(res.error?.message || 'Failed to update status')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(API_ENDPOINTS.admin.model(id), { method: 'DELETE' })
      if (!res.success) throw new Error(res.error?.message || 'Failed to delete model')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (concurrencyValidation.value === undefined) throw new Error(concurrencyValidation.error)
      if (!selectedPreset) throw new Error('Please select a language model preset')
      // The API rejects a language model without a credential
      // (LANGUAGE_MODEL_CONFIG_INVALID), so the picker is mandatory here.
      if (!selectedCredentialId) throw new Error('A language model must be linked to a provider credential')
      const res = await api<AdminModel>(API_ENDPOINTS.admin.models, {
        method: 'POST',
        body: {
          presetId: selectedPresetId,
          providerCredentialId: selectedCredentialId,
          concurrencyLimit: concurrencyValidation.value,
          reasoningEffort,
          enabled: true,
        },
      })
      if (!res.success) throw new Error(res.error?.message || 'Failed to create model')
      return res.data
    },
    onSuccess: () => {
      setCreateModalOpen(false)
      setSelectedPresetId('')
      setSelectedCredentialId('')
      setActionError('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'models'] })
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to create model')
    },
  })

  function openCreateModal() {
    setActionError('')
    setSelectedPresetId('')
    setSelectedCredentialId('')
    setReasoningEffort('medium')
    setCreateModalOpen(true)
  }

  function pickPreset(presetId: string) {
    setSelectedPresetId(presetId)
    setSelectedCredentialId('')
    const preset = presets.find((p) => p.id === presetId)
    if (preset?.reasoningEffort) setReasoningEffort(preset.reasoningEffort)
  }

  const currentDetailModel = models.find((model) => model.id === detailModel?.id) ?? detailModel
  function requestDeleteModel(model: AdminModel) {
    setDeleteTarget(model)
  }
  function toggleModel(model: AdminModel, enabled: boolean) {
    return actions.run(model.id, model.displayName, () => toggleMutation.mutateAsync({ id: model.id, enabled }), enabled ? 'Model enabled' : 'Model disabled', 'toggle')
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="Language model"
        description="Configure language models and inference parameters."
        actions={
          <>
            <Button onClick={openCreateModal} icon={<Plus weight="bold" aria-hidden="true" />}>
              Create language model
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                refetchModels()
                refetchCredentials()
                refetchPresets()
              }}
              icon={<RefreshCw weight="bold" aria-hidden="true" className={modelsLoading ? 'motion-spin' : undefined} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      {modelsData !== undefined && <AdminQueryFeedback error={modelsQueryError} hasData label="Language model" onRetry={() => refetchModels()} />}
      <AdminQueryFeedback error={presetsError} hasData={presetsData !== undefined} label="Model presets" onRetry={() => refetchPresets()} />
      {credentialsData !== undefined && <AdminQueryFeedback error={credentialsQueryError} hasData label="Language model credential" onRetry={() => refetchCredentials()} />}

      <AdminActionErrors errors={actions.errors} />

      <div ref={recordListRef} tabIndex={-1} role="region" aria-label="Language model list" className="flex min-w-0 flex-col gap-4">
      <AdminMobileRecords records={models} loading={modelsLoading}
        error={modelsError && modelsData === undefined ? modelsQueryError?.message || 'Failed to load models' : null}
        onRetry={() => { void refetchModels() }}
        empty={<><span>Prepare an available preset and credential before creating a model.</span><Button variant="secondary" onClick={openCreateModal}>Create model</Button></>}
        title={(model) => model.displayName}
        status={(model) => <Badge tone={model.enabled ? 'success' : 'neutral'}>{model.enabled ? 'Enabled' : 'Disabled'}</Badge>}
        summary={(model) => <><span className="font-mono">{model.vendorModelId || model.name || '—'}</span> · Concurrency {model.concurrencyLimit}</>}
        onDetails={setDetailModel}
      />

      <DataTable cardClassName="hidden md:block" caption="Language model list" columns={7}>
        <TableHead>
          <TableHeadCell>Model name</TableHeadCell>
          <TableHeadCell>Protocol</TableHeadCell>
          <TableHeadCell>Inference parameters</TableHeadCell>
          <TableHeadCell>Linked credential</TableHeadCell>
          <TableHeadCell align="right">Concurrency limit</TableHeadCell>
          <TableHeadCell>Status</TableHeadCell>
          <TableHeadCell align="right">Actions</TableHeadCell>
        </TableHead>
        <TableBody busy={modelsLoading}>
          {modelsLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <TableSkeletonRow
                key={index}
                cells={[
                  <div key="name" className="flex flex-col gap-1"><SkeletonText width="9rem" /><SkeletonText width="6rem" /></div>,
                  <SkeletonText key="protocol" width="6rem" />,
                  <div key="params" className="flex flex-col gap-1"><SkeletonText width="7rem" /><SkeletonText width="5rem" /><SkeletonText width="4rem" /></div>,
                  <SkeletonText key="credential" width="8rem" />,
                  { align: 'right', content: <SkeletonText width="3rem" /> },
                  <div key="status" className="flex items-center gap-2"><SkeletonTile className="aspect-auto h-5 w-9 rounded-pill" /><SkeletonText width="3rem" /></div>,
                  { align: 'right', content: <SkeletonTile className="aspect-auto h-8 w-8 rounded-control" /> },
                ]}
              />
            ))
          ) : modelsError && modelsData === undefined ? (
            <TableStateRow>
              <EmptyState
                variant="error"
                density="compact"
                objectName="Language model"
                title="Unable to load language models"
                description={`${modelsQueryError?.message || 'There was a problem loading the model list'}. Please check the backend service status and retry.`}
                action={<Button variant="secondary" onClick={() => refetchModels()}>Refresh and retry</Button>}
              />
            </TableStateRow>
          ) : models.length > 0 ? (
            models.map((m) => (
              <TableRow key={m.id}>
                <TableCell tone="strong">
                  <div>{m.displayName}</div>
                  <div className="font-mono text-xs font-normal text-muted-foreground">
                    {m.vendorModelId || m.name || '-'}
                  </div>
                </TableCell>
                <TableCell mono textSize="xs" tone="muted">
                  {m.languageProtocol || '-'}
                </TableCell>
                <TableCell>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <dt className="text-muted-foreground">Max output tokens</dt>
                    <dd className="text-right font-mono tabular-nums">{m.maxOutputTokens ?? '-'}</dd>
                    <dt className="text-muted-foreground">Reasoning effort</dt>
                    <dd className="text-right">
                      {m.reasoningEffort ? (REASONING_EFFORT_LABEL[m.reasoningEffort] ?? m.reasoningEffort) : '-'}
                    </dd>
                    <dt className="text-muted-foreground">Temperature</dt>
                    <dd className="text-right font-mono tabular-nums">{m.temperature ?? '-'}</dd>
                  </dl>
                </TableCell>
                <TableCell>
                  {m.providerCredentialName ? (
                    <span>{m.providerCredentialName}</span>
                  ) : (
                    <Badge tone="danger">No credential linked</Badge>
                  )}
                </TableCell>
                <TableCell align="right" mono tabular>{m.concurrencyLimit}</TableCell>
                {/* Immediate setting: the Switch reverts itself when the PATCH rejects,
                    and the banner above states the reason. */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.enabled}
                      disabled={actions.isToggleBlocked(m.id)}
                      onCheckedChange={(enabled) => toggleModel(m, enabled)}
                      aria-label={`Language model ${m.displayName} enabled state`}
                    />
                    <span className="text-xs text-muted-foreground">{m.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    variant="danger-ghost"
                    size="sm"
                    disabled={actions.isPending(m.id)}
                    onClick={() => requestDeleteModel(m)}
                    aria-label={`Delete language model ${m.displayName}`}
                    icon={<Trash2 weight="bold" aria-hidden="true" />}
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableStateRow>
              <EmptyState
                variant="first-use"
                density="compact"
                objectName="Language model"
                title="No language models configured yet"
                description="Create, enable/disable, and delete language models here; inference parameters are chosen at creation. Create a credential below first, then click “Create language model”."
                action={
                  <Button onClick={openCreateModal}>Create first language model</Button>
                }
              />
            </TableStateRow>
          )}
        </TableBody>
      </DataTable>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="language-credentials-heading">
        <SectionHeader
        className="min-w-0 [overflow-wrap:anywhere] max-md:[&_button]:min-h-[var(--control-lg)]"
          id="language-credentials-heading"
          title="Language model credential"
          description="Language models use provider account credentials (openai / anthropic + API Key; a compatible endpoint can be entered). Image and video credentials are created from plugin templates — configure them on the “Media Models” page; custom media credentials created without a plugin template are also listed here."
          actions={
            <Button variant="secondary" onClick={() => setCredentialDialogOpen(true)} icon={<Plus weight="bold" aria-hidden="true" />}>
              Create credential
            </Button>
          }
        />

        <AdminCredentialTable
          credentials={credentials}
          isLoading={credentialsLoading}
          variant="language"
          linkedModels={linkedModelsByCredential}
          emptyText="Create, enable/disable, test connectivity for, and delete language model credentials here. Click “Create credential” at the top right to start."
          error={credentialsError && credentialsData === undefined ? credentialsQueryError?.message || 'Failed to load credential list' : null}
          onRetry={() => refetchCredentials()}
        />
      </section>

      <AdminInstalledPlugins kind="language" />

      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create new language model"
        panelClassName="max-w-form max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!selectedPreset || selectedCredentialMissing || credentialUnavailable || !!concurrencyValidation.error}
              form="admin-create-language-model-form"
            >
              Create model
            </Button>
          </>
        }
      >
        <form id="admin-create-language-model-form" className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!createMutation.isPending && concurrencyValidation.value !== undefined) createMutation.mutate() }}>
          {actionError && (
            <Alert tone="danger" role="alert" title="Unable to create language model">
              {actionError}. Please select a preset, link an available credential, and retry.
            </Alert>
          )}

          <FieldGroup>
            <FormField
              label="Select a language model preset"
              required
              hint={presets.length === 0 ? 'No language model presets are currently available.' : 'Presets are registered by the server and determine the max output tokens and temperature.'}
            >
              <Select value={selectedPresetId} onChange={(e) => pickPreset(e.target.value)}>
                <option value="">Please select a preset</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.vendorModelId})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Link a provider credential"
              required
              hint={
                selectedPreset ? (
                  <>
                    Match credentials by provider <span className="font-mono text-foreground">{selectedPreset.adapter || '-'}</span>
                    {matchingCredentials.length === 0 ? '; no credentials are currently available, please create one in the "Language model credentials" section below' : ''}
                  </>
                ) : undefined
              }
            >
              <Select
                value={selectedCredentialId}
                onChange={(e) => setSelectedCredentialId(e.target.value)}
                disabled={!selectedPreset}
              >
                <option value="">{selectedPreset ? 'Please select a credential' : 'Please select a preset first'}</option>
                {matchingCredentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.providerId || c.adapter})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Reasoning effort"
              hint={
                <>
                  Preset default: 
                  {selectedPreset?.reasoningEffort
                    ? REASONING_EFFORT_LABEL[selectedPreset.reasoningEffort] ?? selectedPreset.reasoningEffort
                    : 'medium'}
                  ; max output tokens and temperature are determined by the preset.
                </>
              }
            >
              <Select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}
              >
                {REASONING_EFFORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Concurrency limit"
              error={concurrencyValidation.error} hint="Maximum number of concurrent jobs for this model, from 1 to 50.">
              <Input
                type="number"
                min="1"
                max="50"
                step="1"
                required
                value={concurrencyLimit}
                onChange={(e) => setConcurrencyLimit(e.target.value)}
              />
            </FormField>
          </FieldGroup>
        </form>
      </Dialog>

      <AdminRecordDetailDialog open={currentDetailModel !== null || deleteTarget !== null} onClose={() => { setDetailModel(null); setDeleteTarget(null) }} title="Model details"
        listFocusRef={recordListRef}
        confirmation={deleteTarget ? {
          objectName: `${deleteTarget.displayName} (${deleteTarget.id})`,
          impact: 'After deletion, no new jobs can be created with this model configuration; linked credentials, history jobs, and reference limits follow server rules. This action cannot be undone.',
          pending: actions.isPending(deleteTarget.id),
          error: actions.errors[deleteTarget.id],
          cancelLabel: currentDetailModel ? 'Back to details' : 'Cancel',
          onCancel: () => setDeleteTarget(null),
          onConfirm: () => {
            if (!deleteTarget || actions.isPending(deleteTarget.id)) return
            const target = deleteTarget
            void actions.run(target.id, target.displayName, () => deleteMutation.mutateAsync(target.id), 'Model deleted', 'delete')
              .then(() => {
                setDeleteTarget((current) => current?.id === target.id ? null : current)
                setDetailModel((current) => current?.id === target.id ? null : current)
              }).catch(() => {})
          },
        } : undefined}
        actions={currentDetailModel && <><Switch checked={currentDetailModel.enabled} disabled={actions.isToggleBlocked(currentDetailModel.id)}
          onCheckedChange={(enabled) => toggleModel(currentDetailModel, enabled)} aria-label={`Model ${currentDetailModel.displayName} enabled state`} /><span>Enable model</span></>}
        danger={currentDetailModel && <Button variant="danger-ghost" disabled={actions.isPending(currentDetailModel.id)} onClick={() => requestDeleteModel(currentDetailModel)}>Delete model</Button>}>
        {currentDetailModel && <>
          <AdminRecordFields fields={[
            { label: 'Model name', value: currentDetailModel.displayName },
            { label: 'Provider model ID', value: <span className="font-mono">{currentDetailModel.vendorModelId || currentDetailModel.name || '—'}</span> },
            { label: 'Protocol', value: currentDetailModel.languageProtocol || '—' },
            { label: 'Max output tokens', value: currentDetailModel.maxOutputTokens ?? '—' },
            { label: 'Reasoning effort', value: currentDetailModel.reasoningEffort ? REASONING_EFFORT_LABEL[currentDetailModel.reasoningEffort] ?? currentDetailModel.reasoningEffort : '—' },
            { label: 'Temperature', value: currentDetailModel.temperature ?? '—' },
            { label: 'Linked credential', value: currentDetailModel.providerCredentialName || 'No credential linked' },
            { label: 'Concurrency limit', value: currentDetailModel.concurrencyLimit },
            { label: 'Status', value: currentDetailModel.enabled ? 'Enabled' : 'Disabled' },
          ]} />
          {actions.errors[currentDetailModel.id] && <Alert tone="danger" role="alert">{actions.errors[currentDetailModel.id]}</Alert>}
        </>}
      </AdminRecordDetailDialog>

      <AdminProviderCredentialDialog
        open={credentialDialogOpen}
        onClose={() => setCredentialDialogOpen(false)}
        scope="language"
      />
    </div>
  )
}
