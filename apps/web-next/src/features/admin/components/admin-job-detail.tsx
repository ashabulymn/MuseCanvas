'use client'

import type { AdminJob } from '@/shared/types'
import { Badge } from '@/shared/components/ui'
import { formatLocalizedDateTime } from '@/shared/lib/format'
import { jobStatusMeta } from '@/shared/lib/job-status'
import { adminJobDetailValues } from '../lib/admin-query'
import { AdminRecordFields } from './admin-record-detail-dialog'
import { AdminCopyValue } from './admin-copy-value'

/** Explicit whitelist shared by recent-job and monitor details, never raw provider data. */
export function AdminJobDetail({ job }: { job: AdminJob }) {
  const values = adminJobDetailValues(job)
  const status = jobStatusMeta(values.status)
  return <AdminRecordFields fields={[
    { label: 'Job ID', value: <AdminCopyValue value={values.id} label="Full job ID" /> },
    { label: 'Creator ID', value: <span className="font-mono">{values.createdBy}</span> },
    { label: 'Model', value: values.modelName },
    { label: 'Model ID', value: <span className="font-mono">{values.modelId}</span> },
    { label: 'Status', value: <Badge className={status.badge}>{status.label}</Badge> },
    { label: 'Error summary', value: values.errorSummary },
    { label: 'Created at', value: formatLocalizedDateTime(values.createdAt) },
  ]} />
}
