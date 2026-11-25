import { SetupWizard, SetupWizardSkeleton } from '@/features/setup/components/setup-wizard'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Panduan Instalasi Sistem - MuseCanvas',
  description: 'Inisialisasi instance MuseCanvas dan konfigurasi lingkungan',
}

export default function SetupPage() {
  return (
    <Suspense fallback={<SetupWizardSkeleton />}>
      <SetupWizard />
    </Suspense>
  )
}
