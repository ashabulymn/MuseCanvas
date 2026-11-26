import { AdminUsersView } from '@/features/admin/components/admin-users-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'User Management - MuseCanvas Admin',
}

export default function AdminUsersPage() {
  return <AdminUsersView />
}
