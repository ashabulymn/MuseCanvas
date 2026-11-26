import { AdminJobsView } from '@/features/admin/components/admin-jobs-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Job Monitoring - MuseCanvas Admin',
}

export default function AdminJobsPage() {
  return <AdminJobsView />
}
