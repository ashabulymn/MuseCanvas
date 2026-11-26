'use client'

import {
  useEffect, useRef, useState } from 'react'
import { useQuery,
  useMutation,
  useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type {
  AdminModel,
  BuiltinProviderTemplate,
  ModelPreset,
  ProviderCredential,
  } from '@/shared/types'
import {
  credentialsForPreset,
  isCustomCredential,
  isPluginBoundCredential,
  presetPluginKey,
  templateConfiguredCount,
  } from '../lib/provider-templates'
import { requireAdminData } from '../lib/admin-query'
import { AdminQueryFeedback } from './admin-query-feedback'
import { AdminCredentialTable } from './admin-credential-table'
import { AdminProviderCredentialDialog } from './admin-provider-credential-dialog'
import { AdminInstalledPlugins } from './admin-installed-plugins'
import { AdminActionErrors } from './admin-confirm-dialog'
import { useAdminActions } from '../lib/use-admin-actions'
import { resolveAdminConcurrency } from '../lib/admin-settings-state'
import { AdminMobileRecords, AdminRecordDetailDialog, AdminRecordFields } from './admin-record-detail-dialog'
import { PuzzlePieceIcon as Blocks,
  PlusIcon as Plus,
  ArrowClockwiseIcon as RefreshCw,
  TrashIcon as Trash2 } from '@phosphor-icons/react'
import {
  Alert,
  Badge,
  Button,
  Card,
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
  iconSize,
} from '@/shared/components/ui'

const MEDIA_KIND_LABEL: Record<'image' | 'video', string> = {
  image: 'Image',
  video: 'Video',
}

export function AdminMediaModelsView() {
  const queryClient = useQueryClient()
  const recordListRef = useRef<HTMLDivElement | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false)
  const [lockedTemplate, setLockedTemplate] = useState<BuiltinProviderTemplate | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [selectedCredentialId, setSelectedCredentialId] = useState('')
  const [concurrencyLimit, setConcurrencyLimit] = useState('1')
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

  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['admin', 'provider-templates'],
    queryFn: async () => {
      const res = await api<{ templates: BuiltinProviderTemplate[] }>(API_ENDPOINTS.admin.providerTemplates)
      return requireAdminData(res, 'Failed to load provider plugins').templates
    },
  })

  const allModels = modelsData ?? []
  const allPresets = presetsData ?? []
  const allCredentials = credentialsData ?? []
  const templates = templatesData ?? []

  // This page owns everything media-shaped: image/video model rows, the plugin
  // directory that signs media credentials, and the plugin-bound credentials.
  const models = allModels.filter((m) => m.modelKind !== 'language')
  const presets = allPresets.filter((p) => p.modelKind !== 'language')
  const mediaCredentials = allCredentials.filter(isPluginBoundCredential)

  const selectedPreset = presets.find((p) => p.id === selectedPresetId) || null
  const selectedPresetPluginKey = presetPluginKey(selectedPreset)
  // The template carries the plugin's endpoint policy, so the picker never offers
  // a credential the API would refuse to bind.
  const selectedTemplate = templates.find(
    (t) => t.pluginId === selectedPreset?.pluginId && t.pluginVersion === selectedPreset?.pluginVersion,
  ) ?? null
  const matchingCredentials = credentialsForPreset(allCredentials, selectedPreset, selectedTemplate)

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

  const linkedModelsByCredential: Record<string, string[]> = {}
  for (const m of models) {
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
      if (!selectedPreset) throw new Error('Please select a model preset')
      const res = await api<AdminModel>(API_ENDPOINTS.admin.models, {
        method: 'POST',
        body: {
          presetId: selectedPresetId,
          providerCredentialId: selectedCredentialId || undefined,
          concurrencyLimit: concurrencyValidation.value,
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

  function openCreateDialog(template: BuiltinProviderTemplate | null) {
    setLockedTemplate(template)
    setCredentialDialogOpen(true)
  }

  function mediaKind(model: AdminModel): 'image' | 'video' {
    return model.modelKind === 'video' ? 'video' : 'image'
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
        title="Media model"
        description="Configure image and video models, the provider plugin directory, and media credentials; configure language models on the “Language Models” page."
        actions={
          <>
            <Button
              onClick={() => {
                setActionError('')
                setCreateModalOpen(true)
              }}
              icon={<Plus weight="bold" aria-hidden="true" />}
            >
              Create model
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                refetchModels()
                refetchCredentials()
                refetchTemplates()
                refetchPresets()
              }}
              icon={<RefreshCw weight="bold" aria-hidden="true" className={modelsLoading ? 'motion-spin' : undefined} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      {modelsData !== undefined && <AdminQueryFeedback error={modelsQueryError} hasData label="Media model" onRetry={() => refetchModels()} />}
      <AdminQueryFeedback error={presetsError} hasData={presetsData !== undefined} label="Model presets" onRetry={() => refetchPresets()} />
      {credentialsData !== undefined && <AdminQueryFeedback error={credentialsQueryError} hasData label="Media credential" onRetry={() => refetchCredentials()} />}
      {templatesData !== undefined && <AdminQueryFeedback error={templatesError} hasData label="Provider plugin" onRetry={() => refetchTemplates()} />}

      <AdminActionErrors errors={actions.errors} />

      <div ref={recordListRef} tabIndex={-1} role="region" aria-label="Media model list" className="flex min-w-0 flex-col gap-4">
      <AdminMobileRecords records={models} loading={modelsLoading}
        error={modelsError && modelsData === undefined ? modelsQueryError?.message || 'Failed to load models' : null}
        onRetry={() => { void refetchModels() }}
        empty={<><span>Prepare an available preset and credential before creating a model.</span><Button variant="secondary" onClick={() => { setActionError(''); setCreateModalOpen(true) }}>Create model</Button></>}
        title={(model) => model.displayName}
        status={(model) => <Badge tone={model.enabled ? 'success' : 'neutral'}>{model.enabled ? 'Enabled' : 'Disabled'}</Badge>}
        summary={(model) => <><span className="font-mono">{model.vendorModelId || model.name || '—'}</span> · Concurrency {model.concurrencyLimit}</>}
        onDetails={setDetailModel}
      />

      <DataTable cardClassName="hidden md:block" caption="Image and video model list" columns={7}>
        <TableHead>
          <TableHeadCell>Model name</TableHeadCell>
          <TableHeadCell>Type</TableHeadCell>
          <TableHeadCell>Bound plugin</TableHeadCell>
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
                  <SkeletonTile key="kind" className="aspect-auto h-6 w-12 rounded-pill" />,
                  <SkeletonText key="plugin" width="8rem" />,
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
                objectName="Media model"
                title="Unable to load media models"
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
                <TableCell>
                  <Badge tone="neutral">{MEDIA_KIND_LABEL[mediaKind(m)]}</Badge>
                </TableCell>
                <TableCell mono textSize="xs" tone="muted">
                  {m.pluginId && m.pluginVersion ? `${m.pluginId}@${m.pluginVersion}` : '-'}
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
                      aria-label={`Model ${m.displayName} enabled state`}
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
                    aria-label={`Delete model ${m.displayName}`}
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
                objectName="Media model"
                title="No media models configured yet"
                description="Create, enable/disable, and delete image and video models here. Click “Create model” at the top right to start."
                action={
                  <Button
                    onClick={() => {
                      setActionError('')
                      setCreateModalOpen(true)
                    }}
                  >
                    Create first model
                  </Button>
                }
              />
            </TableStateRow>
          )}
        </TableBody>
      </DataTable>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="plugin-directory-heading">
        <SectionHeader
        className="min-w-0 [overflow-wrap:anywhere] max-md:[&_button]:min-h-[var(--control-lg)]"
          id="plugin-directory-heading"
          title="Provider plugin directory"
          description="Built-in image / video plugins provided by the provider registry. Credentials belong to provider accounts: when creating a credential from a card's “Create credential”, it is validated against that plugin's declared format and endpoints, and other plugins under the same account can also use it."
        />

        {templatesLoading ? (
          <div className="grid gap-4 lg:grid-cols-2" role="status" aria-busy="true">
            <span className="sr-only">Loading provider plugin directory</span>
            {Array.from({ length: 2 }, (_, index) => (
              <Card key={index} density="compact" aria-hidden="true" className="h-full gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-2"><SkeletonText width="10rem" /><SkeletonText width="7rem" /></div>
                  <div className="flex flex-col items-end gap-2"><SkeletonTile className="aspect-auto h-6 w-12 rounded-pill" /><SkeletonTile className="aspect-auto h-6 w-24 rounded-pill" /></div>
                </div>
                <SkeletonText lines={2} />
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"><SkeletonText width="5rem" /><SkeletonText width="9rem" /><SkeletonText width="5rem" /><SkeletonText width="7rem" /><SkeletonText width="5rem" /><SkeletonText width="10rem" /></div>
                <SkeletonText width="8rem" />
                <div className="flex gap-2"><SkeletonTile className="aspect-auto h-6 w-20 rounded-pill" /><SkeletonTile className="aspect-auto h-6 w-24 rounded-pill" /></div>
                <SkeletonTile className="mt-auto aspect-auto h-[var(--control-md)] w-full rounded-control" />
              </Card>
            ))}
          </div>
        ) : templatesError && templatesData === undefined ? (
          <Alert
            tone="danger"
            role="alert"
            title="Unable to load provider plugins"
            action={
              <Button variant="secondary" size="sm" onClick={() => refetchTemplates()}>
                Refresh and retry
              </Button>
            }
          >
            {templatesError.message || 'Failed to load provider plugins'}. Please check the backend service status and retry.
          </Alert>
        ) : templates.length === 0 ? (
          <Card density="compact">
            <EmptyState
              variant="first-use"
              density="compact"
              objectName="Provider plugin"
              title="No registered provider plugins yet"
              description="Built-in plugins are registered by the server-side provider registry; to extend them, upload a custom plugin under “Installed media plugins” below."
            />
          </Card>
        ) : (
          // `md` is 960px in this token layer: two plugin cards only fit side by side
          // from `lg` once the sidebar and page padding are removed.
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.map((t) => {
              const configured = templateConfiguredCount(allCredentials, t)
              return (
                <Card key={t.key} density="compact" className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Blocks weight="duotone" aria-hidden="true" className={`${iconSize.sm} shrink-0 text-muted-foreground`} />
                        <h3 className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{t.displayName}</h3>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {t.pluginId}@{t.pluginVersion}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone="neutral">{t.modality === 'video' ? 'Video' : 'Image'}</Badge>
                      <Badge tone={configured > 0 ? 'success' : 'danger'}>
                        {configured > 0 ? `${configured} credentials configured` : 'No credentials configured'}
                      </Badge>
                    </div>
                  </div>

                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}

                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                    <dt className="text-muted-foreground">Provider</dt>
                    <dd className="font-mono">{t.providerId}</dd>
                    <dt className="text-muted-foreground">Base URL</dt>
                    <dd className="break-all font-mono">{t.baseUrl}</dd>
                    <dt className="text-muted-foreground">Credential</dt>
                    <dd>
                      {t.credential.label}
                      <span className="ml-1 font-mono text-muted-foreground">
                        {t.credential.schemaId}@{t.credential.schemaVersion}
                      </span>
                    </dd>
                  </dl>

                  <div className="flex flex-col gap-1">
                    <p className="text-overline text-muted-foreground">
                      Supported models (<span className="font-mono tabular-nums">{t.models.length}</span>)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {t.models.map((model) => (
                        <Badge key={model.id} tone="neutral" className="max-w-full font-mono [&>span]:whitespace-normal [&>span]:break-all" title={model.name}>
                          {model.id}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {t.presetIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Linked presets: <span className="font-mono">{t.presetIds.join(', ')}</span>
                    </p>
                  )}

                  <Button
                    variant="secondary"
                    fullWidth
                    className="mt-auto"
                    onClick={() => openCreateDialog(t)}
                    icon={<Plus weight="bold" aria-hidden="true" />}
                  >
                    Create credential
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <AdminInstalledPlugins kind="media" />

      <section className="flex flex-col gap-4" aria-labelledby="media-credentials-heading">
        <SectionHeader
        className="min-w-0 [overflow-wrap:anywhere] max-md:[&_button]:min-h-[var(--control-lg)]"
          id="media-credentials-heading"
          title="Media credential"
          description="Image / video credentials created from plugin templates. Language model and custom credentials are configured on the “Language Models” page."
          actions={
            <Button
              variant="secondary"
              onClick={() => openCreateDialog(null)}
              icon={<Plus weight="bold" aria-hidden="true" />}
            >
              Create credential
            </Button>
          }
        />

        <AdminCredentialTable
          credentials={mediaCredentials}
          isLoading={credentialsLoading}
          variant="media"
          linkedModels={linkedModelsByCredential}
          emptyText="Create, enable/disable, test connectivity for, and delete media credentials here. Create credentials for a specific plugin from the plugin directory above."
          error={credentialsError && credentialsData === undefined ? credentialsQueryError?.message || 'Failed to load credential list' : null}
          onRetry={() => refetchCredentials()}
        />
        {allCredentials.some(isCustomCredential) && (
          <p className="text-xs text-muted-foreground">
            There are also <span className="font-mono tabular-nums">{allCredentials.filter(isCustomCredential).length}</span>{' '}
             custom / language model credentials created without a plugin template, managed on the "Language Models" page.
          </p>
        )}
      </section>

      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create media model"
        panelClassName="max-w-form max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!selectedPreset || credentialUnavailable || !!concurrencyValidation.error}
              form="admin-create-media-model-form"
            >
              Create model
            </Button>
          </>
        }
      >
        <form id="admin-create-media-model-form" className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!createMutation.isPending && concurrencyValidation.value !== undefined) createMutation.mutate() }}>
          {actionError && (
            <Alert tone="danger" role="alert" title="Unable to create model">
              {actionError}. Please select a preset, confirm a credential is available, and retry.
            </Alert>
          )}

          <FieldGroup>
            <FormField
              label="Select a preset"
              required
              hint={presets.length === 0 ? 'No image or video presets are currently available.' : 'Presets are registered by the server and determine the callable model IDs and parameters.'}
            >
              <Select
                value={selectedPresetId}
                onChange={(e) => {
                  setSelectedPresetId(e.target.value)
                  setSelectedCredentialId('')
                }}
              >
                <option value="">Please select a preset</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName} ({p.vendorModelId}) · {p.modelKind === 'video' ? 'Video' : 'Image'}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Link a provider credential"
              hint={
                selectedPreset ? (
                  <>
                    {selectedPresetPluginKey ? (
                      <>Requires a credential from provider <span className="font-mono text-foreground">{selectedPreset.providerId || '-'}</span> (plugin <span className="font-mono text-foreground">{selectedPresetPluginKey}</span>)</>
                    ) : (
                      <>Match credentials by adapter protocol <span className="font-mono text-foreground">{selectedPreset.adapter || '-'}</span></>
                    )}
                    {matchingCredentials.length === 0
                      ? '; no credentials are currently available, please create one in the "Provider plugin directory" below'
                      : ''}
                  </>
                ) : undefined
              }
            >
              <Select
                value={selectedCredentialId}
                onChange={(e) => setSelectedCredentialId(e.target.value)}
                disabled={!selectedPreset}
              >
                <option value="">{selectedPreset ? 'Not linked (jobs will fail without a credential)' : 'Please select a preset first'}</option>
                {matchingCredentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({c.providerId || c.adapter})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Concurrency limit"
              error={concurrencyValidation.error}
              hint="Maximum number of concurrent jobs for this model, from 1 to 50."
            >
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
            { label: 'Type', value: MEDIA_KIND_LABEL[mediaKind(currentDetailModel)] },
            { label: 'Bound plugin', value: <span className="font-mono">{currentDetailModel.pluginId && currentDetailModel.pluginVersion ? `${currentDetailModel.pluginId}@${currentDetailModel.pluginVersion}` : '—'}</span> },
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
        templates={templates}
        lockedTemplate={lockedTemplate}
        scope="media"
      />
    </div>
  )
}
