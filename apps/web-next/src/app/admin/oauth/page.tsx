import { AdminOAuthView } from '@/features/admin/components/admin-oauth-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'OAuth Management - MuseCanvas Admin',
}

export default function AdminOAuthPage() {
  return <AdminOAuthView />
}
