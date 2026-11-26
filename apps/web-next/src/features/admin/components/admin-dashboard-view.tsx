'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import Link from 'next/link'
import { api } from '@/shared/services/api'
import type { AdminJob } from '@/shared/types'
import { requireAdminData } from '../lib/admin-query'
import { AdminQueryFeedback } from './admin-query-feedback'
import { AdminMobileRecords, AdminRecordDetailDialog } from './admin-record-detail-dialog'
import { AdminJobDetail } from './admin-job-detail'
import { formatLocalizedDateTime } from '@/shared/lib/format'
import { jobStatusMeta } from '@/shared/lib/job-status'
import { ArrowClockwiseIcon as RefreshCw } from '@phosphor-icons/react'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SkeletonText,
  StatCard,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  TableSkeletonRow,
  TableStateRow,
  buttonVariants,
} from '@/shared/components/ui'

interface DashboardMetrics {
  totalUsers: number
  totalJobs: number
  successRate7d: number
  failedJobs7d: number
}

interface AdminDashboardViewProps {
  initialMetrics?: DashboardMetrics | null
  initialJobs?: AdminJob[]
}

const RECENT_JOB_LIMIT = 10

export function AdminDashboardView({ initialMetrics, initialJobs = [] }: AdminDashboardViewProps) {
  const [detailJob, setDetailJob] = useState<AdminJob | null>(null)
  const {
    data: metrics,
    refetch: refetchMetrics,
    isFetching: isFetchingMetrics,
    isError: isMetricsError,
    error: metricsError,
  } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const res = await api<DashboardMetrics>(API_ENDPOINTS.admin.dashboard)
      return requireAdminData(res, 'Failed to load summary metrics')
    },
    initialData: initialMetrics ?? undefined,
  })

  const {
    data: jobs,
    refetch: refetchJobs,
    isFetching: isFetchingJobs,
    isLoading: jobsLoading,
    isError: isJobsError,
    error: jobsError,
  } = useQuery({
    queryKey: ['admin', 'jobs', { limit: RECENT_JOB_LIMIT }],
    queryFn: async () => {
      const res = await api<{ items: AdminJob[] }>(API_ENDPOINTS.admin.jobs, {
        params: { limit: RECENT_JOB_LIMIT },
      })
      return requireAdminData(res, 'Failed to load recent jobs').items
    },
    initialData: initialJobs.length ? initialJobs : undefined,
  })

  const refreshing = isFetchingMetrics || isFetchingJobs
  // Skeleton only while there is nothing to show; a background refresh must not
  // wipe the numbers the reader is looking at.
  const metricsPending = metrics == null && isFetchingMetrics
  const jobsPending = jobsLoading

  function handleRefresh() {
    refetchMetrics()
    refetchJobs()
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="System overview"
        description="View system summary metrics and recent job status."
        actions={
          <Button
            variant="secondary"
            loading={refreshing}
            onClick={handleRefresh}
            icon={<RefreshCw weight="bold" aria-hidden="true" />}
          >
            Refresh data
          </Button>
        }
      />

      {isMetricsError ? (
        <Alert
          tone="danger"
          title={metrics ? 'Summary metrics refresh failed' : 'Unable to load summary metrics'}
          action={
            <Button variant="secondary" size="sm" onClick={() => refetchMetrics()}>
              Refresh and retry
            </Button>
          }
        >
          {metricsError?.message ? `${metricsError.message}.` : 'The service returned no statistics.'}
          {metrics ? 'Still showing the last successfully loaded data, which may be outdated.' : 'Please check your network connection, or try again later.'}
        </Alert>
      ) : null}

      {/* KPI grid — 4 columns (desktop) → 2 (tablet, ≥640px) → 1 (phone), gap 24px */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={metrics?.totalUsers ?? '—'} loading={metricsPending} />
        <StatCard label="Total jobs" value={metrics?.totalJobs ?? '—'} loading={metricsPending} />
        <StatCard
          label="7-day success rate"
          value={metrics?.successRate7d != null ? `${metrics.successRate7d}%` : '—'}
          loading={metricsPending}
          className="text-success"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <StatCard
            label="Failed jobs in 7 days"
            value={metrics?.failedJobs7d ?? '—'}
            loading={metricsPending}
            className="text-danger"
          />
          <Link href="/admin/jobs?status=failed" className={buttonVariants({ variant: 'secondary' })}>View all failed jobs</Link>
        </div>
      </div>

      {/* Recent jobs */}
      <section className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="text-subtitle font-normal text-foreground">Recent jobs</h2>
          <Link href="/admin/jobs" className={buttonVariants({ variant: 'secondary' })}>View all jobs</Link>
        </div>
        {jobs !== undefined && <AdminQueryFeedback error={jobsError} hasData label="Recent jobs" onRetry={() => refetchJobs()} />}
        <AdminMobileRecords
          records={jobs ?? []} loading={jobsPending}
          error={isJobsError && jobs === undefined ? jobsError?.message || 'Failed to load recent jobs' : null}
          onRetry={() => { void refetchJobs() }} empty={<>Recent jobs will appear here once users start creating.<Link href="/admin/jobs" className={buttonVariants({ variant: 'secondary' })}>View all jobs</Link></>}
          title={(job) => job.modelName || 'Unknown model'}
          status={(job) => <Badge className={jobStatusMeta(job.status).badge}>{jobStatusMeta(job.status).label}</Badge>}
          summary={(job) => <><span className="font-mono">{job.id.slice(0, 8)}…</span> · {formatLocalizedDateTime(job.createdAt)}</>}
          onDetails={setDetailJob}
        />
        <DataTable cardClassName="hidden md:block" caption={`Most recent ${RECENT_JOB_LIMIT} generation jobs`} columns={4}>
          <TableHead>
            <TableHeadCell>Job ID</TableHeadCell>
            <TableHeadCell>Model</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell align="right">Created at</TableHeadCell>
          </TableHead>
          <TableBody busy={jobsPending}>
            {jobsPending ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableSkeletonRow
                  key={index}
                  cells={[
                    <SkeletonText key="id" width="7rem" />,
                    <SkeletonText key="model" width="9rem" />,
                    <SkeletonText key="status" width="5rem" />,
                    { align: 'right', content: <SkeletonText width="8rem" className="ml-auto" /> },
                  ]}
                />
              ))
            ) : isJobsError && jobs === undefined ? (
              <TableStateRow>
                <EmptyState
                  variant="error"
                  objectName="Recent jobs"
                  density="compact"
                  actionLabel="Refresh and retry"
                  onAction={() => refetchJobs()}
                />
              </TableStateRow>
            ) : jobs && jobs.length > 0 ? (
              jobs.map((job) => {
                const status = jobStatusMeta(job.status)
                return (
                  <TableRow key={job.id}>
                    <TableCell mono tone="muted"><Button variant="ghost" size="sm" onClick={() => setDetailJob(job)} aria-label={`View job ${job.id} details`}>{job.id.slice(0, 8)}…</Button></TableCell>
                    <TableCell tone="strong">
                      {job.modelName || 'Unknown model'}
                    </TableCell>
                    <TableCell>
                      <Badge className={status.badge}>{status.label}</Badge>
                    </TableCell>
                    <TableCell align="right" mono tabular tone="muted">
                      {formatLocalizedDateTime(job.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableStateRow>
                <EmptyState
                  variant="first-use"
                  objectName="Generation job"
                  density="compact"
                  title="No generation jobs yet"
                  description="Recent jobs will appear here once users start creating."
                  action={
                    <Link href="/admin/jobs" className={buttonVariants({ variant: 'secondary' })}>
                      View all jobs
                    </Link>
                  }
                />
              </TableStateRow>
            )}
          </TableBody>
        </DataTable>
        <AdminRecordDetailDialog open={detailJob !== null} onClose={() => setDetailJob(null)} title="Recent job details">
          {detailJob && <AdminJobDetail job={detailJob} />}
        </AdminRecordDetailDialog>
      </section>
    </div>
  )
}
