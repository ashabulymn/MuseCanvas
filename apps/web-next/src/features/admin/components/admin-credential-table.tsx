'use client'

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { ProviderCredential, ProviderTestStatus } from '@/shared/types'
import { credentialPluginKey } from '../lib/provider-templates'
import { useAdminActions } from '../lib/use-admin-actions'
import { AdminActionErrors } from './admin-confirm-dialog'
import { AdminMobileRecords, AdminRecordDetailDialog, AdminRecordFields } from './admin-record-detail-dialog'
import { TrashIcon as Trash2 } from '@phosphor-icons/react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  IconButton,
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

interface AdminCredentialTableProps {
  credentials: ProviderCredential[]
  isLoading: boolean
  /**
   * `media` rows were created from a plugin template and show that plugin and
   * their provider account; `language` rows were created without one (provider +
   * API key) and show which models consume them.
   */
  variant: 'media' | 'language'
  /** Model display names keyed by the credential id they are bound to. */
  linkedModels?: Record<string, string[]>
  /** First-use copy: what is missing and how to create it. */
  emptyText: string
  /** List request failed — renders the `error` empty state instead of first-use. */
  error?: ReactNode
  /** Retry handler for the `error` state; wired to the caller's existing `refetch`. */
  onRetry?: () => void
}

const TEST_STATUS_LABEL: Record<ProviderTestStatus, string> = {
  success: 'Test passed',
  failed: 'Test failed',
  not_tested: 'Not tested',
  pending: 'Testing',
}

// Shared credential console merged out of the former 供应商凭据 page: list,
// enable/disable, connectivity test and delete. Creation lives in each page's
// dialog because the payload shape differs per scope.
export function AdminCredentialTable({
  credentials,
  isLoading,
  variant,
  linkedModels = {},
  emptyText,
  error,
  onRetry,
}: AdminCredentialTableProps) {
  const queryClient = useQueryClient()
  const recordListRef = useRef<HTMLDivElement | null>(null)
  const [detailCredential, setDetailCredential] = useState<ProviderCredential | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderCredential | null>(null)
  const actions = useAdminActions()

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(API_ENDPOINTS.admin.providerCredential(id), { method: 'DELETE' })
      if (!res.success) throw new Error(res.error?.message || 'Failed to delete credential')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await api(API_ENDPOINTS.admin.providerCredential(id), { method: 'PATCH', body: { enabled } })
      if (!res.success) throw new Error(res.error?.message || 'Failed to update credential status')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
    },
  })

  async function handleTest(credential: ProviderCredential) {
    await actions.run(credential.id, credential.displayName, async () => {
      try {
        const res = await api<{ tested: boolean; status: string }>(API_ENDPOINTS.admin.providerCredentialTest(credential.id), {
          method: 'POST',
        })
        if (!res.success || (res.data?.status !== 'pending' && !(res.data?.tested && res.data.status === 'success'))) {
          throw new Error(res.error?.message || 'Connectivity test failed')
        }
        return res.data
      } finally {
        // Even a failed test may stamp the last-test status on the server.
        await queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
      }
    }, 'Connectivity test request completed; see the latest test for the final result', 'test')
  }

  const currentDetailCredential = credentials.find((credential) => credential.id === detailCredential?.id) ?? detailCredential
  function requestDeleteCredential(credential: ProviderCredential) {
    setDeleteTarget(credential)
  }
  function credentialBusy(credential: ProviderCredential) {
    return actions.isPending(credential.id) || credential.lastTestStatus === 'pending'
  }
  function toggleCredential(credential: ProviderCredential, enabled: boolean) {
    return actions.run(credential.id, credential.displayName, () => toggleMutation.mutateAsync({ id: credential.id, enabled }), enabled ? 'Credential enabled' : 'Credential disabled', 'toggle')
  }

  return (
    <div ref={recordListRef} tabIndex={-1} role="region" aria-label="Provider credential list" className="flex flex-col gap-3">
      <AdminActionErrors errors={actions.errors} />

      <AdminMobileRecords records={credentials} loading={isLoading}
        error={error ? typeof error === 'string' ? error : 'Failed to load credentials' : null}
        onRetry={onRetry} empty={emptyText}
        title={(credential) => credential.displayName}
        status={(credential) => <Badge tone={credential.enabled ? 'success' : 'neutral'}>{credential.enabled ? 'Enabled' : 'Disabled'}</Badge>}
        summary={(credential) => <>{credential.providerId || credential.adapter || '—'} · Latest test: {TEST_STATUS_LABEL[credential.lastTestStatus] || credential.lastTestStatus}</>}
        onDetails={setDetailCredential}
      />

      <DataTable cardClassName="hidden md:block" caption={variant === 'media' ? 'Media provider credential list' : 'Language model provider credential list'} columns={6}>
        <TableHead>
          <TableHeadCell>Credential name</TableHeadCell>
          <TableHeadCell>{variant === 'media' ? 'Source plugin' : 'Provider'}</TableHeadCell>
          <TableHeadCell>{variant === 'media' ? 'Provider account' : 'Linked models'}</TableHeadCell>
          <TableHeadCell>API key status</TableHeadCell>
          <TableHeadCell>Status</TableHeadCell>
          <TableHeadCell align="right">Actions</TableHeadCell>
        </TableHead>
        <TableBody busy={isLoading}>
          {isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <TableSkeletonRow
                key={index}
                cells={[
                  <div key="name" className="flex flex-col gap-1"><SkeletonText width="9rem" /><SkeletonText width="11rem" /><SkeletonText width="8rem" /></div>,
                  <SkeletonText key="provider" width="7rem" />,
                  <SkeletonText key="account" lines={variant === 'media' ? 2 : 1} width="9rem" />,
                  <SkeletonTile key="key" className="aspect-auto h-6 w-24 rounded-pill" />,
                  <div key="status" className="flex items-center gap-2"><SkeletonTile className="aspect-auto h-5 w-9 rounded-pill" /><SkeletonText width="3rem" /></div>,
                  { align: 'right', content: <div className="flex flex-wrap items-center justify-end gap-2"><SkeletonTile className="aspect-auto h-8 w-20 rounded-control" /><SkeletonTile className="aspect-auto h-8 w-8 rounded-control" /></div> },
                ]}
              />
            ))
          ) : error ? (
            <TableStateRow>
              <EmptyState
                variant="error"
                density="compact"
                objectName={variant === 'media' ? 'Media credential' : 'Language model credential'}
                title="Unable to load credential list"
                description={
                  typeof error === 'string'
                    ? `${error}. Please check the backend service status and retry.`
                    : 'There was a problem loading credential data; the service may be temporarily unavailable. Please try again later.'
                }
                action={onRetry ? <Button variant="secondary" onClick={onRetry}>Refresh and retry</Button> : undefined}
              />
            </TableStateRow>
          ) : credentials.length > 0 ? (
            credentials.map((c) => {
              const pluginKey = credentialPluginKey(c)
              const linked = linkedModels[c.id] || []
              const hasSecret = Boolean(c.hasApiKey || c.hasCredential)
              return (
                <TableRow key={c.id}>
                  <TableCell tone="strong">
                    <div>{c.displayName}</div>
                    {c.baseUrl && (
                      <div className="break-all font-mono text-xs font-normal text-muted-foreground">{c.baseUrl}</div>
                    )}
                    <div className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                      Latest test: {TEST_STATUS_LABEL[c.lastTestStatus] || c.lastTestStatus}
                      {c.lastTestErrorCode ? ` (${c.lastTestErrorCode})` : ''}
                    </div>
                  </TableCell>
                  {variant === 'media' ? (
                    <TableCell mono textSize="xs" tone="foreground">{pluginKey || '-'}</TableCell>
                  ) : (
                    <TableCell mono textSize="xs" tone="muted">{c.providerId || c.adapter || '-'}</TableCell>
                  )}
                  {variant === 'media' ? (
                    <TableCell mono textSize="xs" tone="muted">
                      <div>{c.providerId || '-'}</div>
                    </TableCell>
                  ) : (
                    <TableCell tone="muted">
                      {linked.length > 0 ? (
                        <span className="text-foreground">{linked.join(', ')}</span>
                      ) : (
                        <span>No linked models</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge tone={hasSecret ? 'success' : 'danger'}>{hasSecret ? 'Secret configured' : 'No secret set'}</Badge>
                  </TableCell>
                  {/* Immediate setting: `Switch` reverts itself when the PATCH rejects,
                      and the failure message above surfaces the reason. */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.enabled}
                        disabled={actions.isToggleBlocked(c.id, c.lastTestStatus === 'pending')}
                        onCheckedChange={(enabled) => toggleCredential(c, enabled)}
                        aria-label={`Credential ${c.displayName} enabled state`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {c.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                          {/* `loading` keeps the label and the measured idle width, so the
                              row never reflows mid-test. */}
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={c.lastTestStatus === 'pending'}
                            disabled={credentialBusy(c)}
                            onClick={() => { void handleTest(c).catch(() => {}) }}
                            aria-label={`Test connectivity for credential ${c.displayName}`}
                          >
                            Connectivity test
                          </Button>
                          <IconButton
                            variant="danger-ghost"
                            size="sm"
                            disabled={credentialBusy(c)}
                            onClick={() => requestDeleteCredential(c)}
                            aria-label={`Delete credential ${c.displayName}`}
                            icon={<Trash2 weight="bold" aria-hidden="true" />}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableStateRow>
                  <EmptyState
                    variant="first-use"
                    density="compact"
                    objectName={variant === 'media' ? 'Media credential' : 'Language model credential'}
                    title={variant === 'media' ? 'No media credentials yet' : 'No language model credentials yet'}
                    description={emptyText}
                  />
                </TableStateRow>
              )}
        </TableBody>
      </DataTable>
      <AdminRecordDetailDialog open={currentDetailCredential !== null || deleteTarget !== null} onClose={() => { setDetailCredential(null); setDeleteTarget(null) }} title="Credential details"
        listFocusRef={recordListRef}
        confirmation={deleteTarget ? {
          objectName: `${deleteTarget.displayName} (${deleteTarget.id})`,
          impact: (linkedModels[deleteTarget.id]?.length ?? 0) > 0
            ? `Currently linked models: ${linkedModels[deleteTarget.id].join(', ')}. Deleting may affect calls to these models; reference limits are enforced by the server. The secret cannot be recovered after deletion.`
            : 'No linked models found in the current list; reference limits are still enforced by the server. The secret cannot be recovered after deletion.',
          pending: actions.isPending(deleteTarget.id),
          error: actions.errors[deleteTarget.id],
          cancelLabel: currentDetailCredential ? 'Back to details' : 'Cancel',
          onCancel: () => setDeleteTarget(null),
          onConfirm: () => {
            if (!deleteTarget || actions.isPending(deleteTarget.id)) return
            const target = deleteTarget
            void actions.run(target.id, target.displayName, () => deleteMutation.mutateAsync(target.id), 'Credential deleted', 'delete')
              .then(() => {
                setDeleteTarget((current) => current?.id === target.id ? null : current)
                setDetailCredential((current) => current?.id === target.id ? null : current)
              }).catch(() => {})
          },
        } : undefined}
        actions={currentDetailCredential && <>
          <Switch checked={currentDetailCredential.enabled} disabled={actions.isToggleBlocked(currentDetailCredential.id, currentDetailCredential.lastTestStatus === 'pending')}
            onCheckedChange={(enabled) => toggleCredential(currentDetailCredential, enabled)} aria-label={`Credential ${currentDetailCredential.displayName} enabled state`} />
          <span>Enable credential</span>
          <Button variant="secondary" loading={currentDetailCredential.lastTestStatus === 'pending'} disabled={credentialBusy(currentDetailCredential)}
            onClick={() => { void handleTest(currentDetailCredential).catch(() => {}) }}>Connectivity test</Button>
        </>}
        danger={currentDetailCredential && <Button variant="danger-ghost" disabled={credentialBusy(currentDetailCredential)} onClick={() => requestDeleteCredential(currentDetailCredential)}>Delete credential</Button>}>
        {currentDetailCredential && <>
          <AdminRecordFields fields={[
            { label: 'Credential name', value: currentDetailCredential.displayName },
            { label: 'Source plugin', value: credentialPluginKey(currentDetailCredential) || 'Custom credential' },
            { label: 'Provider account', value: currentDetailCredential.providerId || currentDetailCredential.adapter || '—' },
            { label: 'Base URL', value: <span className="font-mono">{currentDetailCredential.baseUrl || '—'}</span> },
            { label: 'Linked models', value: linkedModels[currentDetailCredential.id]?.join(', ') || 'No linked models' },
            { label: 'Secret status', value: currentDetailCredential.hasApiKey || currentDetailCredential.hasCredential ? 'Secret configured' : 'No secret set' },
            { label: 'Status', value: currentDetailCredential.enabled ? 'Enabled' : 'Disabled' },
            { label: 'Latest test', value: TEST_STATUS_LABEL[currentDetailCredential.lastTestStatus] || currentDetailCredential.lastTestStatus },
            { label: 'Latest test error code', value: currentDetailCredential.lastTestErrorCode || '—' },
          ]} />
          <AdminActionErrors errors={actions.errors[currentDetailCredential.id] ? { [currentDetailCredential.id]: actions.errors[currentDetailCredential.id] } : {}} />
        </>}
      </AdminRecordDetailDialog>
    </div>
  )
}
