import { AccountView } from '@/features/account/components/account-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Account settings - MuseCanvas',
  description: 'MuseCanvas account configuration and security settings',
}

export default function AccountPage() {
  return <AccountView />
}
