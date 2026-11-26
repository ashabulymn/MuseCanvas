import { SetupWizard, SetupWizardSkeleton } from '@/features/setup/components/setup-wizard'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'System Installation Guide - MuseCanvas',
  description: 'Initialize the MuseCanvas instance and configure the environment',
}

export default function SetupPage() {
  return (
    <Suspense fallback={<SetupWizardSkeleton />}>
      <SetupWizard />
    </Suspense>
  )
}
