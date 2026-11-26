import { AdminSettingsView } from '@/features/admin/components/admin-settings-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'System Settings - MuseCanvas Admin',
}

export default function AdminSettingsPage() {
  return <AdminSettingsView />
}
