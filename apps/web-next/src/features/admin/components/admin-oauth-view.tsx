'use client'

import { useQuery,
  useMutation,
  useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS,
  type OAuthProviderName } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { AdminOAuthProvider } from '@/shared/types'
import { useAdminActions } from '../lib/use-admin-actions'
import { AdminActionErrors } from './admin-confirm-dialog'
import { AdminCopyValue } from './admin-copy-value'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SkeletonText,
  SkeletonTile,
  Switch,
  iconSize,
} from '@/shared/components/ui'
import { ArrowClockwiseIcon as RefreshCw } from '@phosphor-icons/react'

const oauthQueryKey = ['admin', 'oauth-providers'] as const

const sourceLabel: Record<AdminOAuthProvider['source'], string> = {
  database: 'Database configuration',
  environment: 'Environment variable configuration',
  none: 'No credentials configured',
}

/** Provider ids are lowercase codes; the display name comes from the payload's label. */
function providerName(provider: AdminOAuthProvider): string {
  return provider.label || provider.provider
}

export function AdminOAuthView() {
  const queryClient = useQueryClient()
  const actions = useAdminActions()

  const {
    data: providers = [],
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: oauthQueryKey,
    queryFn: async () => {
      const res = await api<AdminOAuthProvider[]>(API_ENDPOINTS.admin.oauthProviders)
      if (!res.success) throw new Error(res.error?.message || 'Failed to read OAuth providers')
      return res.data || []
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ provider, enabled }: { provider: string; enabled: boolean }) => {
      const res = await api(API_ENDPOINTS.admin.oauthProvider(provider as OAuthProviderName), {
        method: 'PATCH',
        body: { enabled },
      })
      if (!res.success) throw new Error(res.error?.message || 'Failed to update status')
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: oauthQueryKey })
    },
  })

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="OAuth login providers"
        description="View third-party login configuration and manage enable/disable. Provider credentials are set by the setup flow or server environment; the admin console provides no edit form."
        actions={
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            loading={isFetching}
            icon={<RefreshCw weight="bold" aria-hidden="true" className={iconSize.sm} />}
          >
            Refresh
          </Button>
        }
      />

      <AdminActionErrors errors={actions.errors} />

      {isLoading ? (
        <div className="flex flex-col gap-4" role="status" aria-busy="true">
          <span className="sr-only">Loading OAuth providers</span>
          {['github', 'google'].map((provider) => (
            <Card key={provider} aria-hidden="true" className="min-w-0 flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SkeletonText width={provider === 'github' ? '6rem' : '7rem'} />
                  <SkeletonTile className="aspect-auto h-6 w-16 rounded-pill" />
                  <SkeletonTile className="aspect-auto h-6 w-24 rounded-pill" />
                </div>
                <SkeletonText width="15rem" />
                <SkeletonText width="22rem" />
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <SkeletonText width="5rem" />
                <SkeletonTile className="aspect-auto h-5 w-9 rounded-pill" />
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {isError ? (
        <EmptyState
          variant="error"
          title="Unable to load OAuth providers"
          description={
            error instanceof Error
              ? `${error.message}. Please check the admin session and network, then retry.`
              : 'There was a problem loading data; please try again later.'
          }
          onAction={() => void refetch()}
          actionLabel="Refresh and retry"
        />
      ) : null}

      {!isLoading && !isError ? (
        providers.length > 0 ? (
          <div className="flex flex-col gap-4">
            {providers.map((p) => {
              const name = providerName(p)
              return (
                <Card key={p.provider} className="min-w-0 flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-module text-foreground">{name}</h2>
                      <Badge tone={p.enabled ? 'success' : 'neutral'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge>
                      <Badge tone={p.source === 'none' ? 'warning' : 'neutral'}>{sourceLabel[p.source]}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Client ID: 
                      <span className="font-mono text-foreground">
                        {p.clientId ? `${p.clientId.slice(0, 8)}…` : 'Not configured'}
                      </span>
                    </p>
                    <div className="min-w-0 text-sm text-muted-foreground">
                      <p className="mb-1">Callback URL</p>
                      <AdminCopyValue value={p.redirectUri || undefined} label={`${name} Callback URL`} unavailable="No callback URL configured" />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">Enable login</span>
                    <Switch
                      checked={p.enabled}
                      aria-label={`${name} login`}
                      disabled={actions.isToggleBlocked(p.provider)}
                      onCheckedChange={(enabled) =>
                        actions.run(p.provider, name, () => toggleMutation.mutateAsync({ provider: p.provider, enabled }), enabled ? 'OAuth login enabled' : 'OAuth login disabled', 'toggle')
                      }
                    />
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <EmptyState
              variant="first-use"
              objectName="OAuth login"
              title="Welcome to OAuth login"
              description="Enable or disable GitHub and Google login here. Provider credentials are written by server environment variables or the setup flow; the admin console does not create providers."
              actionLabel="Refresh provider list"
              onAction={() => void refetch()}
            >
              <p className="max-w-reading text-sm text-muted-foreground">
                If the list stays empty, first fill in the corresponding provider's Client ID and Client Secret in the deployment configuration for this instance.
              </p>
            </EmptyState>
          </Card>
        )
      ) : null}
    </div>
  )
}
