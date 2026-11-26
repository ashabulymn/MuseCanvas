'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { AdminJob, JobStatus, PaginatedResponse } from '@/shared/types'
import { adminJobErrorSummary, requireAdminData } from '../lib/admin-query'
import { AdminQueryFeedback } from './admin-query-feedback'
import { AdminMobileRecords, AdminRecordDetailDialog } from './admin-record-detail-dialog'
import { AdminJobDetail } from './admin-job-detail'
import { AdminCursorControls, useAdminCursor } from './admin-cursor-controls'
import { AdminFilterPanel } from './admin-filter-panel'
import { EMPTY_ADMIN_JOB_FILTERS, readAdminJobFilters, resolveAdminJobFilters } from '../lib/admin-list-state'
import type { AdminJobFilters } from '../lib/admin-list-state'
import { ADMIN_JOB_REFRESH_MS, shouldPollAdminJobs } from '../lib/admin-job-refresh'
import { formatLocalizedDateTime } from '@/shared/lib/format'
import { jobStatusMeta } from '@/shared/lib/job-status'
import { ArrowsDownUpIcon as ArrowUpDown, ArrowClockwiseIcon as RefreshCw } from '@phosphor-icons/react'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SkeletonText,
  TableBody,
  TableHead,
  TableHeadCell,
  TableRow,
  TableSkeletonRow,
  TableStateRow,
  TableCell,
} from '@/shared/components/ui'

/** Each cursor request fetches at most this many jobs, newest-first server-side. */
const JOB_PAGE_LIMIT = 50

/** Values accepted by `GET /api/admin/jobs?status=`; labels ride `jobStatusMeta`. */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...(
    ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'canceled'] as JobStatus[]
  ).map((status) => ({ value: status, label: jobStatusMeta(status).label })),
]

export function AdminJobsView() {
  const searchParams = useSearchParams()
  const initialFilters = readAdminJobFilters(searchParams)
  const [draftFilters, setDraftFilters] = useState<AdminJobFilters>(() => initialFilters.draft)
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>(() => initialFilters.valid ? initialFilters.params : {})
  const [filterErrors, setFilterErrors] = useState<Partial<Record<keyof AdminJobFilters, string>>>(() => initialFilters.errors)
  const [urlFilterError, setUrlFilterError] = useState(!initialFilters.valid)
  const jobCursor = useAdminCursor()
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [documentVisible, setDocumentVisible] = useState(true)
  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === 'visible')
    updateVisibility()
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])
  useEffect(() => {
    if (jobCursor.batch > 1) setAutoRefresh(false)
  }, [jobCursor.batch])
  const polling = shouldPollAdminJobs(autoRefresh, documentVisible, jobCursor.batch)
  const requestParams = { ...appliedFilters, limit: JOB_PAGE_LIMIT, cursor: jobCursor.cursor }

  function applyFilters(draft: AdminJobFilters) {
    const resolved = resolveAdminJobFilters(draft)
    setFilterErrors(resolved.errors)
    if (!resolved.valid) return
    setUrlFilterError(false)
    setAppliedFilters(resolved.params)
    jobCursor.reset()
  }
  function editFilter(key: keyof AdminJobFilters, value: string) {
    setDraftFilters((previous) => ({ ...previous, [key]: value }))
    setFilterErrors((previous) => ({ ...previous, [key]: undefined }))
  }
  const [detailJob, setDetailJob] = useState<AdminJob | null>(null)
  const [timeSort, setTimeSort] = useState<'desc' | 'asc'>('desc')

  const {
    data: jobsPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['admin', 'jobs', requestParams],
    refetchInterval: polling ? ADMIN_JOB_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    // Focus must not silently refresh a paused or historical batch.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const res = await api<PaginatedResponse<AdminJob>>(API_ENDPOINTS.admin.jobs, {
        params: requestParams,
      })
      return requireAdminData(res, 'Failed to load job list')
    },
  })

  const jobs = jobsPage?.items ?? []

  // Client-side sort over the fetched page: the monitor's natural order is
  // newest-first, flipping stays cheap and keeps the filter server-driven.
  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        return timeSort === 'desc' ? -delta : delta
      }),
    [jobs, timeSort],
  )

  const filterActive = Object.keys(appliedFilters).length > 0
  const clearFilter = () => { setDraftFilters(EMPTY_ADMIN_JOB_FILTERS); applyFilters(EMPTY_ADMIN_JOB_FILTERS) }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="Job monitoring"
        description="System-wide generation job status with recorded error summaries; no progress percentage is shown because the API does not provide one."
        actions={
          <>
          <Button variant="secondary" disabled={jobCursor.batch > 1} onClick={() => setAutoRefresh((previous) => !previous)}>
            {autoRefresh ? 'Pause auto-refresh' : 'Enable 15-second refresh'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => refetch()}
            loading={isFetching}
            icon={<RefreshCw weight="bold" aria-hidden="true" />}
          >
            {error ? 'Retry refresh' : 'Refresh manually'}
          </Button>
          </>
        }
      />

      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <p>{jobCursor.batch > 1 ? 'Browsing a history batch: auto-refresh is paused; return to the first batch to enable it manually.' : !autoRefresh ? 'Auto-refresh is paused.' : !documentVisible ? 'Background tab: auto-refresh is paused.' : 'Foreground tab refreshes the current first batch every 15 seconds.'}</p>
        <p>Last successful update: {dataUpdatedAt ? formatLocalizedDateTime(new Date(dataUpdatedAt).toISOString()) : 'No data fetched successfully yet'}</p>
      </div>

      {urlFilterError && <Alert tone="warning" role="status" title="Link filters not applied">The ID, status, or time format in the link is invalid. Showing the unfiltered first batch; open the filters, fix them, and apply.</Alert>}

      <AdminFilterPanel activeCount={Object.keys(appliedFilters).length} summary={Object.entries(appliedFilters).map(([key, value]) => `${({ status: 'Status', userId: 'User ID', modelId: 'Model ID', from: 'From', to: 'To' } as Record<string, string>)[key]} ${key === 'status' ? STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value : value}`).join(' · ')}>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); applyFilters(draftFilters) }}>
          <FormField label="Job status" error={filterErrors.status} className="w-full sm:w-48">
            <Select value={draftFilters.status} onChange={(event) => editFilter('status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </FormField>
          <FormField label="User ID" error={filterErrors.userId} hint="Full UUID, matching the creator." className="w-full sm:w-64">
            <Input value={draftFilters.userId} onChange={(event) => editFilter('userId', event.target.value)} placeholder="User UUID" />
          </FormField>
          <FormField label="Model ID" error={filterErrors.modelId} hint="Full UUID, not the provider model name." className="w-full sm:w-64">
            <Input value={draftFilters.modelId} onChange={(event) => editFilter('modelId', event.target.value)} placeholder="Model configuration UUID" />
          </FormField>
          <FormField label="Submitted from" error={filterErrors.from} hint="Local time, including the start time." className="w-full sm:w-64">
            <Input type="datetime-local" value={draftFilters.from} onChange={(event) => editFilter('from', event.target.value)} />
          </FormField>
          <FormField label="Submitted to" error={filterErrors.to} hint="Local time, including the end time." className="w-full sm:w-64">
            <Input type="datetime-local" value={draftFilters.to} onChange={(event) => editFilter('to', event.target.value)} />
          </FormField>
          <Button type="submit">Apply filters</Button>
          <Button variant="ghost" onClick={clearFilter}>Clear filters</Button>
        </form>
      </AdminFilterPanel>

      {jobsPage && <AdminQueryFeedback error={error} hasData label="Job list" onRetry={() => refetch()} />}

      <Button variant="secondary" className="md:hidden" onClick={() => setTimeSort((previous) => previous === 'desc' ? 'asc' : 'desc')}>
        Submitted at: {timeSort === 'desc' ? 'Newest first' : 'Oldest first'}(current batch)
      </Button>
      <AdminMobileRecords
        records={sortedJobs} loading={isLoading}
        error={isError && !jobsPage ? error?.message || 'Failed to load jobs' : null}
        onRetry={() => { void refetch() }} empty={filterActive ? 'No jobs match the current filters; adjust the conditions above.' : 'Jobs will appear here once users start generating.'}
        title={(job) => job.modelName || 'Unknown model'}
        status={(job) => <Badge className={jobStatusMeta(job.status).badge}>{jobStatusMeta(job.status).label}</Badge>}
        summary={(job) => <><span className="font-mono">{job.id.slice(0, 8)}…</span> · {formatLocalizedDateTime(job.createdAt)}</>}
        onDetails={setDetailJob}
      />

      <DataTable cardClassName="hidden md:block" caption="Job monitoring list" columns={6}>
        <TableHead>
          <TableHeadCell>Job ID</TableHeadCell>
          <TableHeadCell>User</TableHeadCell>
          <TableHeadCell>Model</TableHeadCell>
          <TableHeadCell>Status</TableHeadCell>
          <TableHeadCell>Error message</TableHeadCell>
          <TableHeadCell
            align="right"
            sort={timeSort === 'desc' ? 'descending' : 'ascending'}
          >
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 text-inherit"
              onClick={() => setTimeSort((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              icon={<ArrowUpDown weight="bold" aria-hidden="true" />}
            >
              Submitted at (current batch)
            </Button>
          </TableHeadCell>
        </TableHead>
        <TableBody busy={isLoading}>
          {isLoading ? (
            Array.from({ length: 6 }, (_, index) => (
              <TableSkeletonRow
                key={index}
                cells={[
                  <SkeletonText key="id" width="7rem" />,
                  <SkeletonText key="user" width="9rem" />,
                  <SkeletonText key="model" width="8rem" />,
                  <SkeletonText key="status" width="5rem" />,
                  <SkeletonText key="error" width="10rem" />,
                  { align: 'right', content: <SkeletonText width="8rem" className="ml-auto" /> },
                ]}
              />
            ))
          ) : isError && !jobsPage ? (
            <TableStateRow>
              <EmptyState
                variant="error"
                objectName="Job list"
                title="Unable to load job list"
                description="There was a problem requesting job data; the service may be temporarily unavailable. Please try again later, or check the backend service status."
                actionLabel="Refresh and retry"
                onAction={() => refetch()}
              />
            </TableStateRow>
          ) : sortedJobs.length > 0 ? (
            sortedJobs.map((job) => {
              const status = jobStatusMeta(job.status)
              const errorSummary = adminJobErrorSummary(job)
              return (
                <TableRow key={job.id}>
                  <TableCell mono tone="muted"><Button variant="ghost" size="sm" onClick={() => setDetailJob(job)} aria-label={`View job ${job.id} details`}>{job.id.slice(0, 8)}…</Button></TableCell>
                  <TableCell tone="foreground">{job.createdBy || '—'}</TableCell>
                  <TableCell tone="strong">{job.modelName || 'Unknown model'}</TableCell>
                  <TableCell>
                    {/* Colour + the state in words: never colour alone. */}
                    <Badge className={status.badge}>{status.label}</Badge>
                  </TableCell>
                  <TableCell tone="muted">
                    {errorSummary ? (
                      <span className="block max-w-60 break-words text-danger">
                        {errorSummary}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right" mono tabular tone="muted">
                    {formatLocalizedDateTime(job.createdAt)}
                  </TableCell>
                </TableRow>
              )
            })
          ) : filterActive ? (
            <TableStateRow>
              <EmptyState
                variant="no-results"
                objectName="Job"
                density="compact"
                onAction={clearFilter}
              />
            </TableStateRow>
          ) : (
            <TableStateRow>
              <EmptyState
                variant="first-use"
                objectName="Generation job"
                density="compact"
                title="No generation jobs yet"
                description="Jobs will appear here in reverse chronological order once users start generating."
              />
            </TableStateRow>
          )}
        </TableBody>
      </DataTable>

      <AdminRecordDetailDialog open={detailJob !== null} onClose={() => setDetailJob(null)} title="Job details">
        {detailJob && <>
          <p className="text-xs text-muted-foreground">Details are a snapshot of the record when opened; auto-refresh does not replace the dialog content. Close and reopen to see the latest record from the list.</p>
          <AdminJobDetail job={detailJob} />
        </>}
      </AdminRecordDetailDialog>

      <AdminCursorControls batch={jobCursor.batch} count={jobs.length} total={jobsPage?.total}
        hasMore={!isError && jobsPage?.hasMore} nextCursor={jobsPage?.nextCursor} busy={isFetching}
        onPrevious={() => { if (!isFetching) jobCursor.previous() }} onNext={() => { if (!isFetching && !isError) jobCursor.next(jobsPage?.nextCursor) }} />
      <p className="text-sm text-muted-foreground">At most {JOB_PAGE_LIMIT} items per batch; submitted-time sorting only affects the current batch, and batch order is always provided by the server from newest to oldest.</p>
    </div>
  )
}
