'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { AdminUser, Invitation, PaginatedResponse, UserRole } from '@/shared/types'
import { invitationStatus, requireAdminData } from '../lib/admin-query'
import { AdminQueryFeedback } from './admin-query-feedback'
import { AdminMobileRecords, AdminRecordDetailDialog, AdminRecordFields } from './admin-record-detail-dialog'
import { AdminCursorControls, useAdminCursor } from './admin-cursor-controls'
import { AdminFilterPanel } from './admin-filter-panel'
import { searchAdminInvitations } from '../lib/admin-list-state'
import { AdminCopyValue } from './admin-copy-value'
import { formatLocalizedDate } from '@/shared/lib/format'
import { ArrowClockwiseIcon as RefreshCw, UserPlusIcon as UserPlus } from '@phosphor-icons/react'
import {
  Alert,
  Badge,
  Card,
  useToast,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Select,
  PageHeader,
  SkeletonText,
  SkeletonTile,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TableSkeletonRow,
  TableStateRow,
  Tabs,
} from '@/shared/components/ui'
import type { BadgeTone, TabItem } from '@/shared/components/ui'

const ROLE_META: Record<UserRole, { label: string; tone: BadgeTone }> = {
  admin: { label: 'Administrator', tone: 'accent' },
  user: { label: 'Regular user', tone: 'neutral' },
}

type AdminUsersTab = 'users' | 'invitations'

export function AdminUsersView() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [createdInvitation, setCreatedInvitation] = useState<Invitation | null | undefined>(undefined)
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null)
  const [detailInvitation, setDetailInvitation] = useState<Invitation | null>(null)
  const [activeTab, setActiveTab] = useState<AdminUsersTab>('users')
  const [emailDraft, setEmailDraft] = useState('')
  const [statusDraft, setStatusDraft] = useState('all')
  const [userFilters, setUserFilters] = useState({ email: '', status: 'all' })
  const [invitationSearch, setInvitationSearch] = useState('')
  const userCursor = useAdminCursor()
  const userParams = { email: userFilters.email || undefined, status: userFilters.status === 'all' ? undefined : userFilters.status, limit: 50, cursor: userCursor.cursor }

  function applyUserFilters(email: string, status: string) {
    setUserFilters({ email: email.trim(), status })
    userCursor.reset()
  }


  const [actionError, setActionError] = useState<string>('')

  // Create invitation modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const {
    data: usersPage,
    isLoading: usersLoading,
    isError: usersError,
    error: usersQueryError,
    isFetching: usersFetching,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['admin', 'users', userParams],
    queryFn: async () => {
      const res = await api<PaginatedResponse<AdminUser>>(API_ENDPOINTS.admin.users, { params: userParams })
      return requireAdminData(res, 'Failed to load user list')
    },
  })

  const {
    data: invitationsData,
    isLoading: invitesLoading,
    isError: invitesError,
    error: invitesQueryError,
    isFetching: invitesFetching,
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: async () => {
      const res = await api<{ items: Invitation[] }>(API_ENDPOINTS.admin.invitations)
      // Rows carry the admin-decryptable plaintext code (undefined for pre-encryption legacy rows).
      return requireAdminData(res, 'Failed to load invitation code list').items
    },
  })

  // Create invitation mutation
  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api<Invitation>(API_ENDPOINTS.admin.invitations, {
        method: 'POST',
        body: {},
      })
      if (!res.success) {
        throw new Error(res.error?.message || 'The server rejected the create request')
      }
      return res.data
    },
    onSuccess: (invitation) => {
      setCreatedInvitation(invitation ?? null)
      toast.push({ variant: 'success', title: invitation?.code ? 'Invitation code created' : 'Create request completed' })
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] })
    },
    onError: (err: unknown) => {
      const reason = err instanceof Error && err.message ? err.message : 'Network request did not complete'
      setActionError(`${reason}. Please try creating it again later.`)
    },
  })

  const users = usersPage?.items ?? []
  const invitations = searchAdminInvitations(invitationsData ?? [], invitationSearch)

  const refreshing = activeTab === 'users' ? usersFetching : invitesFetching
  function handleRefresh() {
    if (activeTab === 'users') refetchUsers()
    else refetchInvites()
  }

  function openInviteDialog() {
    setActionError('')
    if (!createInviteMutation.isPending) createInviteMutation.reset()
    setInviteModalOpen(true)
  }

  const tabs: TabItem[] = [
    {
      id: 'users',
      label: `Registered users (${usersPage?.total ?? '—'})`,
      content: (
        <div className="flex min-w-0 flex-col gap-4">
        <AdminFilterPanel activeCount={Number(!!userFilters.email) + Number(userFilters.status !== 'all')} summary={[userFilters.email && `Email contains ${userFilters.email}`, userFilters.status !== 'all' && (userFilters.status === 'active' ? 'Active' : 'Disabled')].filter(Boolean).join(' · ')}>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); applyUserFilters(emailDraft, statusDraft) }}>
            <FormField label="Email contains" className="w-full sm:w-64"><Input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} placeholder="Search all registered users" /></FormField>
            <FormField label="User status" className="w-full sm:w-48"><Select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option>
            </Select></FormField>
            <Button type="submit">Apply filters</Button>
            <Button variant="ghost" onClick={() => { setEmailDraft(''); setStatusDraft('all'); applyUserFilters('', 'all') }}>Clear filters</Button>
          </form>
        </AdminFilterPanel>
        <AdminMobileRecords records={users} loading={usersLoading}
          error={usersError && !usersPage ? usersQueryError?.message || 'Failed to load users' : null}
          onRetry={() => { void refetchUsers() }} empty={userFilters.email || userFilters.status !== 'all' ? 'No registered users match; adjust or clear the filters.' : 'Users will appear here after registering via login or an invitation code.'}
          title={(user) => user.email}
          status={(user) => <Badge tone={(ROLE_META[user.role] ?? ROLE_META.user).tone}>{(ROLE_META[user.role] ?? ROLE_META.user).label}</Badge>}
          summary={(user) => <>{user.status === 'disabled' ? 'Disabled' : 'Active'} · {formatLocalizedDate(user.createdAt)}</>}
          onDetails={setDetailUser}
        />
        <DataTable cardClassName="hidden md:block" caption="Registered user list" columns={4}>
          <TableHead>
            <TableHeadCell>Email</TableHeadCell>
            <TableHeadCell>Role</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell align="right">Registered at</TableHeadCell>
          </TableHead>
          <TableBody busy={usersLoading}>
            {usersLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableSkeletonRow
                  key={index}
                  cells={[
                    <SkeletonText key="email" width="14rem" />,
                    <SkeletonTile key="role" className="aspect-auto h-6 w-16 rounded-pill" />,
                    <SkeletonText key="status" width="4rem" />,
                    { align: 'right', content: <SkeletonText width="7rem" /> },
                  ]}
                />
              ))
            ) : usersError && !usersPage ? (
              <TableStateRow>
                <EmptyState
                  variant="error"
                  objectName="User list"
                  title="Unable to load user list"
                  description="There was a problem requesting user data; the service may be temporarily unavailable. Please try again later, or check the backend service status."
                  actionLabel="Refresh and retry"
                  onAction={() => refetchUsers()}
                />
              </TableStateRow>
            ) : users.length > 0 ? (
              users.map((u) => {
                const role = ROLE_META[u.role] ?? ROLE_META.user
                return (
                  <TableRow key={u.id}>
                    <TableCell tone="strong">{u.email}</TableCell>
                    <TableCell>
                      <Badge tone={role.tone}>{role.label}</Badge>
                    </TableCell>
                    <TableCell><Badge tone={u.status === 'disabled' ? 'neutral' : 'success'}>{u.status === 'disabled' ? 'Disabled' : 'Active'}</Badge></TableCell>
                    <TableCell align="right" mono tabular tone="muted">
                      {formatLocalizedDate(u.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableStateRow>
                <EmptyState
                  variant="first-use"
                  objectName="Registered user"
                  density="compact"
                  title={userFilters.email || userFilters.status !== 'all' ? 'No matching registered users' : 'No registered users yet'}
                  description={userFilters.email || userFilters.status !== 'all' ? 'Please adjust or clear the filters.' : 'Users will appear here after registering via login or an invitation code.'}
                />
              </TableStateRow>
            )}
          </TableBody>
        </DataTable>
        <AdminCursorControls batch={userCursor.batch} count={users.length} total={usersPage?.total} hasMore={!usersQueryError && usersPage?.hasMore} nextCursor={usersPage?.nextCursor}
          busy={usersFetching} onPrevious={() => { if (!usersFetching) userCursor.previous() }} onNext={() => { if (!usersFetching && !usersQueryError) userCursor.next(usersPage?.nextCursor) }} />

        </div>
      ),
    },
    {
      id: 'invitations',
      label: `Invitation codes (${invitationsData?.length ?? '—'} in this window)`,
      content: (
        <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">Only the most recent 100 invitation codes are shown; the search below matches only within this window, not across all records.</p>
        <AdminFilterPanel activeCount={Number(!!invitationSearch.trim())} summary={`Current window search: ${invitationSearch.trim()}`}>
          <FormField label="Search the current invitation code window" hint="Search the most recent 100 records by invitation code or record ID.">
            <Input value={invitationSearch} onChange={(event) => setInvitationSearch(event.target.value)} placeholder="Search within the current window" />
          </FormField>
        </AdminFilterPanel>
        <AdminMobileRecords records={invitations} loading={invitesLoading}
          error={invitesError && invitationsData === undefined ? invitesQueryError?.message || 'Failed to load invitation codes' : null}
          onRetry={() => { void refetchInvites() }} empty={<>{invitationSearch.trim() ? 'No invitation codes in the current window match; adjust the search term.' : 'After creating an invitation code, send it to the user who needs to register.'}<Button variant="secondary" onClick={openInviteDialog}>Create invitation code</Button></>}
          title={(invitation) => <span className="font-mono">{invitation.code || 'Plaintext unavailable'}</span>}
          status={(invitation) => <Badge tone={invitationStatus(invitation).tone}>{invitationStatus(invitation).label}</Badge>}
          summary={(invitation) => formatLocalizedDate(invitation.createdAt)}
          onDetails={setDetailInvitation}
        />
        <DataTable cardClassName="hidden md:block" caption="Invitation code list" columns={3}>
          <TableHead>
            <TableHeadCell>Invitation code</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell align="right">Created at</TableHeadCell>
          </TableHead>
          <TableBody busy={invitesLoading}>
            {invitesLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableSkeletonRow
                  key={index}
                  cells={[
                    <SkeletonText key="code" width="12rem" />,
                    <SkeletonTile key="status" className="aspect-auto h-6 w-16 rounded-pill" />,
                    { align: 'right', content: <SkeletonText width="7rem" /> },
                  ]}
                />
              ))
            ) : invitesError && invitationsData === undefined ? (
              <TableStateRow>
                <EmptyState
                  variant="error"
                  objectName="Invitation code list"
                  title="Unable to load invitation code list"
                  description="There was a problem requesting invitation code data; the service may be temporarily unavailable. Please try again later, or check the backend service status."
                  actionLabel="Refresh and retry"
                  onAction={() => refetchInvites()}
                />
              </TableStateRow>
            ) : invitations.length > 0 ? (
              invitations.map((inv) => {
                const status = invitationStatus(inv)
                return (
                  <TableRow key={inv.id}>
                    <TableCell mono tabular tone="foreground"><AdminCopyValue value={inv.code} label="Invitation code" /></TableCell>
                    <TableCell>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </TableCell>
                    <TableCell align="right" mono tabular tone="muted">
                      {formatLocalizedDate(inv.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableStateRow>
                <EmptyState
                  variant="first-use"
                  objectName="Invitation code"
                  density="compact"
                  title={invitationSearch.trim() ? 'No matching invitation codes in the current window' : 'No invitation codes yet'}
                  description={invitationSearch.trim() ? 'Please adjust the search term; only the most recent 100 records are searched.' : 'After creating an invitation code, send it to the user who needs to register.'}
                  onAction={openInviteDialog}
                />
              </TableStateRow>
            )}
          </TableBody>
        </DataTable>
        </div>
      ),
    },
  ]

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="User & invitation management"
        description="View registered users, roles, and account status, and create and view invitation codes; this page does not change user roles or account status."
        actions={
          <>
            {activeTab === 'invitations' && (
              <Button onClick={openInviteDialog} icon={<UserPlus weight="bold" aria-hidden="true" />}>
                Create invitation code
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleRefresh}
              loading={refreshing}
              icon={<RefreshCw weight="bold" aria-hidden="true" />}
            >
              Refresh
            </Button>
          </>
        }
      />

      {activeTab === 'users' && usersPage && (
        <AdminQueryFeedback error={usersQueryError} hasData label="User list" onRetry={() => refetchUsers()} />
      )}
      {activeTab === 'invitations' && invitationsData !== undefined && (
        <AdminQueryFeedback error={invitesQueryError} hasData label="Invitation code list" onRetry={() => refetchInvites()} />
      )}

      {activeTab === 'invitations' && createdInvitation !== undefined && <Card className="min-w-0 gap-3">
        <h2 className="text-module">Most recent creation result</h2>
        <p className="text-sm text-muted-foreground">The result is kept until the next successful creation. Share the invitation code only with users who need to register.</p>
        <AdminCopyValue value={createdInvitation?.code} label="New invitation code" unavailable="The create request completed, but the response did not include the invitation code plaintext. Refresh the list to verify; the record ID is not an invitation code and cannot be used to register." />
      </Card>}

      <Tabs
        tabs={tabs}
        value={activeTab}
        onValueChange={(id) => setActiveTab(id as AdminUsersTab)}
        aria-label="Users & invitations"
      />

      <AdminRecordDetailDialog open={detailUser !== null} onClose={() => setDetailUser(null)} title="User details">
        {detailUser && <AdminRecordFields fields={[
          { label: 'Email', value: detailUser.email },
          { label: 'User ID', value: <span className="font-mono">{detailUser.id}</span> },
          { label: 'Role', value: (ROLE_META[detailUser.role] ?? ROLE_META.user).label },
          { label: 'Status', value: detailUser.status === 'disabled' ? 'Disabled' : 'Active' },
          { label: 'Registered at', value: formatLocalizedDate(detailUser.createdAt) },
        ]} />}
      </AdminRecordDetailDialog>
      <AdminRecordDetailDialog open={detailInvitation !== null} onClose={() => setDetailInvitation(null)} title="Invitation code details">
        {detailInvitation && <AdminRecordFields fields={[
          { label: 'Invitation code', value: <AdminCopyValue value={detailInvitation.code} label="Invitation code" /> },
          { label: 'Record ID (not the invitation code)', value: <span className="font-mono">{detailInvitation.id}</span> },
          { label: 'Status', value: invitationStatus(detailInvitation).label },
          { label: 'Created at', value: formatLocalizedDate(detailInvitation.createdAt) },
        ]} />}
      </AdminRecordDetailDialog>

      {/* Create Invite Modal */}
      <Dialog open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} title="Create invitation code" panelClassName="max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]">
        {createInviteMutation.isSuccess ? <div className="flex min-w-0 flex-col gap-4">
          <p className="text-sm">The create request completed; only the invitation code plaintext actually returned by the API is shown below.</p>
          <AdminCopyValue value={createdInvitation?.code} label="New invitation code" unavailable="The response did not include the invitation code plaintext; refresh the list to verify. Do not use the record ID in place of the invitation code." />
          <Button variant="secondary" onClick={() => setInviteModalOpen(false)}>Done</Button>
        </div> : <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!createInviteMutation.isPending) createInviteMutation.mutate()
          }}
        >
          {actionError ? (
            // The 4px bar is `Alert`'s `danger` tone — a soft red is never a border colour.
            <div id="invite-error">
              <Alert tone="danger" role="alert" title="Unable to create invitation code">
                {actionError}
              </Alert>
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">Invitation codes are not tied to an email. After creation, share them with users who need to register.</p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createInviteMutation.isPending}
              icon={<UserPlus weight="bold" aria-hidden="true" />}
            >
              Create invitation code
            </Button>
          </div>
        </form>}
      </Dialog>
    </div>
  )
}
