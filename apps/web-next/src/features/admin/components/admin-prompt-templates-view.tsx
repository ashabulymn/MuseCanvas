'use client'

import {
  useRef, useState } from 'react'
import { useQuery,
  useMutation,
  useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS,
  type PromptTemplateSetDetailDto } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import { Dialog } from '@/shared/components/ui/dialog'
import { useAdminActions } from '../lib/use-admin-actions'
import { AdminActionErrors } from './admin-confirm-dialog'
import { AdminRecordDetailDialog, AdminRecordFields } from './admin-record-detail-dialog'
import { searchAdminPromptTemplates } from '../lib/admin-list-state'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardTitle,
  EmptyState,
  FormField,
  IconButton,
  Input,
  PageHeader,
  SkeletonText,
  SkeletonTile,
  Textarea,
  buttonVariants,
  controlSquare,
  iconSize,
  useToast,
} from '@/shared/components/ui'
import { DownloadSimpleIcon as Download, FileTextIcon as FileText, PlusIcon as Plus, ArrowClockwiseIcon as RefreshCw, TrashIcon as Trash2 } from '@phosphor-icons/react'

export function AdminPromptTemplatesView() {
  const queryClient = useQueryClient()
  const recordListRef = useRef<HTMLDivElement | null>(null)
  const toast = useToast()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instruction, setInstruction] = useState('')
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const [detailTemplate, setDetailTemplate] = useState<PromptTemplateSetDetailDto['entries'][number] | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplateSetDetailDto['entries'][number] | null>(null)
  const actions = useAdminActions()
  // Deletions fork the entire active set, so all entries share this serial lock.
  const deletionKey = 'active-template-set'

  const {
    data: activeSet,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery<PromptTemplateSetDetailDto | null>({
    queryKey: ['admin', 'prompt-templates'],
    queryFn: async () => {
      const res = await api<PromptTemplateSetDetailDto | null>(API_ENDPOINTS.admin.promptTemplates)
      if (!res.success) throw new Error(res.error?.message || 'Failed to load prompt templates')
      return res.data ?? null
    },
  })

  const entries = searchAdminPromptTemplates(activeSet?.entries ?? [], search)
  function requestDeleteTemplate(template: PromptTemplateSetDetailDto['entries'][number]) {
    setDeleteTarget(template)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeSet) throw new Error('No template set is active; import a template set via the setup wizard first')
      if (!name.trim() || !instruction.trim()) throw new Error('Please fill in the name and prompt content completely')
      const res = await api(API_ENDPOINTS.admin.promptTemplateSetEntries(activeSet.id), {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          instruction: instruction.trim(),
        },
      })
      if (!res.success) throw new Error(res.error?.message || 'Failed to create template')
      return res.data
    },
    onSuccess: async () => {
      setCreateModalOpen(false)
      setName('')
      setDescription('')
      setInstruction('')
      toast.push({ variant: 'success', title: 'Template created' })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prompt-templates'] })
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to create template')
    },
  })

  // Deleting an entry forks a new set version on the backend, so the whole
  // active-set query must be refetched rather than patched locally.
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(API_ENDPOINTS.admin.promptTemplateEntry(id), { method: 'DELETE' })
      if (!res.success) throw new Error(res.error?.message || 'Failed to delete template')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'prompt-templates'] })
    },
  })

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="Prompt templates"
        description={
          activeSet
            ? `Active template set: ${activeSet.name} (version ${activeSet.version}, ${activeSet.entryCount} entries), available as shortcuts in the studio.`
            : 'Manage built-in and categorized prompt templates for quick use in the studio.'
        }
        actions={
          <>
            {activeSet ? (
              <a
                href={`${API_ENDPOINTS.admin.promptTemplatesExport}?setId=${encodeURIComponent(activeSet.id)}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                <Download weight="bold" aria-hidden="true" className={iconSize.sm} />
                Export template set
              </a>
            ) : null}
            <Button
              onClick={() => {
                setActionError('')
                setCreateModalOpen(true)
              }}
              disabled={!activeSet || actions.isPending(deletionKey) || createMutation.isPending}
              title={activeSet ? undefined : 'Import and activate a template set first'}
              icon={<Plus weight="bold" aria-hidden="true" className={iconSize.sm} />}
            >
              Create template
            </Button>
            <Button
              variant="secondary"
              onClick={() => void refetch()}
              loading={isFetching}
              icon={<RefreshCw weight="bold" aria-hidden="true" className={iconSize.sm} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      <FormField label="Search the active template set" hint={`Searches only the current set's names, descriptions, and full instructions; ${entries.length} / ${activeSet?.entries.length ?? 0} entries match.`}>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, description, or instruction keyword" disabled={!activeSet} />
      </FormField>

      <AdminActionErrors errors={actions.errors} />

      {isError ? (
        <Alert
          tone="danger"
          role="alert"
          title="Unable to load prompt templates"
          action={
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
              Refresh and retry
            </Button>
          }
        >
          {error instanceof Error ? `${error.message}. Please confirm the admin session is still valid.` : 'There was a problem loading data; please try again later.'}
        </Alert>
      ) : null}

      {!isLoading && !isError && !activeSet ? (
        <Alert tone="info" role="status" title="No active template set">
          <span className="flex items-start gap-2">
            <FileText weight="duotone" aria-hidden="true" className={`mt-0.5 ${iconSize.sm} shrink-0`} />
            Template sets are imported via the setup wizard (/setup); entries are managed on the active set, and templates can be created once a set is active.
          </span>
        </Alert>
      ) : null}

      <div ref={recordListRef} tabIndex={-1} role="region" aria-label="Current prompt template list" className="min-w-0">
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="status" aria-busy="true">
          <span className="sr-only">Loading prompt templates</span>
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} aria-hidden="true" density="compact">
              <div className="flex items-start justify-between gap-3">
                <SkeletonTile className="aspect-auto h-6 w-24 rounded-pill" />
                <SkeletonTile className={`aspect-auto ${controlSquare.sm} rounded-control`} />
              </div>
              <SkeletonText width={index % 2 === 0 ? '11rem' : '9rem'} />
              <SkeletonText lines={3} />
            </Card>
          ))}
        </div>
      ) : null}

      {!isLoading && !isError && activeSet ? (
        entries.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {entries.map((t) => (
              <Card key={t.id} density="compact">
                <CardBody className="gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <Badge tone="neutral" className="[&>span]:whitespace-normal [&>span]:break-words [overflow-wrap:anywhere]">{t.description || 'General template'}</Badge>
                    <IconButton
                      variant="danger-ghost"
                      size="sm"
                      aria-label={`Delete prompt template: ${t.name}`}
                      loading={!!deleteTarget && deleteTarget.id === t.id && actions.isPending(deletionKey)}
                      disabled={actions.isPending(deletionKey) || createMutation.isPending}
                      onClick={() => requestDeleteTemplate(t)}
                      icon={<Trash2 weight="bold" aria-hidden="true" className={iconSize.sm} />}
                    />
                  </div>
                  <CardTitle level={3}>{t.name}</CardTitle>
                  <CardDescription className="line-clamp-3">{t.instruction}</CardDescription>
                  <Button variant="secondary" onClick={() => setDetailTemplate(t)}>View full instructions</Button>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              variant="first-use"
              objectName="Prompt templates"
              title={search.trim() ? 'No matching templates in the active set' : undefined}
              description={search.trim() ? 'Adjust or clear the search term; the search does not include other template set versions.' : undefined}
              actionLabel="Create first template"
              onAction={() => {
                setActionError('')
                setCreateModalOpen(true)
              }}
            />
          </Card>
        )
      ) : null}
      </div>

      <AdminRecordDetailDialog open={detailTemplate !== null || deleteTarget !== null} onClose={() => { setDetailTemplate(null); setDeleteTarget(null) }} title="Full prompt template"
        listFocusRef={recordListRef}
        confirmation={deleteTarget ? {
          objectName: `${deleteTarget.name} (${deleteTarget.id})`,
          impact: 'Deleting will derive and activate a new template set version, affecting the templates available in the studio; it does not edit the old version directly. No other entries can be deleted until the operation and directory refresh complete.',
          pending: actions.isPending(deletionKey),
          error: actions.errors[deletionKey],
          cancelLabel: detailTemplate ? 'Back to details' : 'Cancel',
          onCancel: () => setDeleteTarget(null),
          onConfirm: () => {
            if (!deleteTarget || createMutation.isPending || actions.isPending(deletionKey)) return
            const target = deleteTarget
            void actions.run(deletionKey, target.name, () => deleteMutation.mutateAsync(target.id), 'Template deleted', 'delete')
              .then(() => {
                setDeleteTarget((current) => current?.id === target.id ? null : current)
                setDetailTemplate((current) => current?.id === target.id ? null : current)
              }).catch(() => {})
          },
        } : undefined}
        danger={detailTemplate && <Button variant="danger-ghost" disabled={actions.isPending(deletionKey) || createMutation.isPending} onClick={() => requestDeleteTemplate(detailTemplate)}>Delete this template</Button>}>
        {detailTemplate && <>
          <AdminRecordFields fields={[
            { label: 'Name', value: detailTemplate.name },
            { label: 'Description', value: detailTemplate.description || 'General template' },
          ]} />
          <div className="min-w-0"><h3 className="mb-2 text-sm font-medium">Full instructions (Instruction)</h3>
            <pre className="select-text whitespace-pre-wrap break-words font-mono text-sm [overflow-wrap:anywhere]">{detailTemplate.instruction}</pre>
          </div>
        </>}
      </AdminRecordDetailDialog>

      {/* Create Modal */}
      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create prompt template"
        size="narrow"
      panelClassName="max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]"
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (!actions.isPending(deletionKey) && !createMutation.isPending) createMutation.mutate()
          }}
        >
          {actionError ? (
            <Alert tone="danger" role="alert">
              {actionError}
            </Alert>
          ) : null}

          <FormField label="Template name" required>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: cyberpunk city style"
            />
          </FormField>

          <FormField label="Description" hint="Used for the label in the studio; shows as a general template when left empty.">
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Example: enhance color contrast and neon lighting"
            />
          </FormField>

          <FormField
            label="Template instruction content (Instruction)"
            required
            hint="The body template sent to the model; supports {{input_prompt}} interpolation."
          >
            <Textarea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Enter a detailed prompt template…"
            />
          </FormField>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !instruction.trim() || actions.isPending(deletionKey)} loading={createMutation.isPending}>
              Create template
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
