'use client'

import {
  useEffect,
  useState } from 'react'
import Link from 'next/link'
import { useRouter,
  useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type {
  BootstrapCheckKey,
  OnboardingSectionKey,
  OnboardingSectionState,
  SetupStatusResponse,
  } from '@/shared/types'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  SkeletonRow,
  SkeletonText,
  Stepper,
  buttonVariants,
  iconSize,
} from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'
import { CheckIcon as Check, CaretLeftIcon as ChevronLeft, CaretRightIcon as ChevronRight, WarningCircleIcon as CircleAlert } from '@phosphor-icons/react'

/**
 * What the wizard can actually read from `GET /setup/status`: the persisted
 * onboarding sections and the server-side bootstrap diagnostics. Everything else
 * on these steps is a manual checklist item and is labelled as such — the guide
 * never presents reading a checklist as having run a check (components.md 反馈与状态:
 * 不把假保存、假上传包装成完成).
 */
interface WizardStep {
  id: string
  label: string
  /** Onboarding sections whose real, stored status this step reports. */
  sections: OnboardingSectionKey[]
  summary: string
  /** Manual verification items: the wizard does not check these. */
  manual: string[]
}

const steps: WizardStep[] = [
  {
    id: 'site',
    label: 'Konfigurasi situs',
    sections: ['site'],
    summary: 'Konfigurasi situs mencakup domain layanan (misalnya https://musecanvas.example.com) dan endpoint akses publik.',
    manual: [
      'Environment variable server BASE_URL sudah mengarah ke alamat publik instance ini.',
      'Nama dan alamat situs akan dipakai untuk email, callback OAuth, dan link berbagi.',
    ],
  },
  {
    id: 'smtp',
    label: 'SMTP email & admin',
    sections: ['smtp', 'admin'],
    summary: 'Konfigurasi server SMTP pengirim untuk mengirim kode OTP login email ke pengguna, lalu buat akun admin pertama.',
    manual: [
      'Tes pengiriman dilakukan di halaman konfigurasi sistem pada admin panel; wizard ini sendiri tidak mengirim email apa pun.',
      'Di lingkungan dev, kode OTP bisa langsung dilihat dari output konsol backend, tanpa perlu pengiriman email untuk debugging.',
    ],
  },
  {
    id: 'storage',
    label: 'Object storage (S3)',
    sections: ['storage'],
    summary: 'Object storage (kompatibel S3, Alibaba Cloud OSS, Tencent Cloud COS, Cloudflare R2, MinIO lokal) dipakai untuk menyimpan aset gambar hasil generate pengguna secara persisten.',
    manual: [
      'Kredensial bucket ditulis di halaman konfigurasi sistem pada admin panel; wizard tidak membaca atau menulis objek apa pun.',
      'Worker akan mengunggah aset ke bucket tujuan setelah generate selesai, lalu menerbitkan URL aksesnya.',
    ],
  },
  {
    id: 'providers',
    label: 'Model AI & supplier',
    sections: ['providers', 'models'],
    summary: 'Konfigurasi kredensial layanan model generate upstream (misalnya OpenAI DALL·E 3, Seedream Volcengine, Anthropic Claude, Google Veo).',
    manual: [
      'Kredensial bisa ditambah dengan banyak API Key setelah panduan selesai, dari admin panel, beserta tarif dan kuota pemakaian.',
      'Wizard tidak memanggil antarmuka upstream apa pun, dan tidak memvalidasi apakah Key bisa dipakai.',
    ],
  },
  {
    id: 'review',
    label: 'Pemeriksaan lingkungan & selesai',
    sections: ['oauth', 'templates', 'runtime'],
    summary: 'Ringkasan hasil pemeriksaan lingkungan yang dicatat server saat startup, beserta item panduan yang belum selesai.',
    manual: ['"Pemeriksaan lingkungan" di bawah berasal dari hasil pembacaan server; item lainnya perlu dikonfirmasi satu per satu secara manual.'],
  },
]

export function SetupWizardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground" role="status" aria-busy="true">
      <span className="sr-only">Memuat status konfigurasi sistem</span>
      <header className="flex min-h-[var(--layout-header)] shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </header>
      <div className="shrink-0 border-b border-border bg-tonal px-4 py-4 sm:px-6" aria-hidden="true">
        <ol className="mx-auto flex w-full max-w-content flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
          {steps.map((step) => (
            <li key={step.id} className="relative flex min-w-0 items-center gap-3 pb-6 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28 sm:max-w-full" />
            </li>
          ))}
        </ol>
      </div>
      <main className="flex flex-1 justify-center px-4 py-6 sm:px-6" aria-hidden="true">
        <div className="w-full max-w-form">
          <Card className="gap-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-40" />
              <SkeletonText lines={1} />
            </div>
            <div className="flex flex-col gap-6">
              <SkeletonText lines={2} />
              <div className="flex flex-col gap-3 rounded-control bg-tonal p-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <SkeletonText lines={1} />
                </div>
                <SkeletonRow />
                <SkeletonRow />
              </div>
              <div className="flex flex-col gap-3 rounded-control bg-tonal p-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <SkeletonText lines={1} />
                </div>
                <SkeletonText lines={2} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-[var(--control-md)] w-28 rounded-control" />
              <Skeleton className="h-[var(--control-md)] w-28 rounded-control" />
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}

const checkKeyLabel: Record<BootstrapCheckKey, string> = {
  database: 'Koneksi database',
  redis: 'Antrean Redis Streams',
  masterKey: 'Master key (HKDF)',
  runtime: 'Batasan runtime',
}

function sectionLabel(key: OnboardingSectionKey): string {
  return {
    bootstrap: 'Panduan lingkungan',
    site: 'Info situs',
    smtp: 'Email SMTP',
    admin: 'Akun admin',
    storage: 'Object storage',
    providers: 'Supplier model',
    models: 'Model generate',
    oauth: 'Login OAuth',
    templates: 'Template prompt',
    runtime: 'Batasan runtime',
  }[key]
}

function SectionStatusLine({
  sectionKey,
  state,
}: {
  sectionKey: OnboardingSectionKey
  state?: OnboardingSectionState
}) {
  const complete = state?.status === 'complete'
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="text-sm text-foreground">{sectionLabel(sectionKey)}</span>
      <span className="flex items-center gap-2">
        {state ? (
          <span className="font-mono text-xs text-muted-foreground">{state.updatedAt.slice(0, 10)}</span>
        ) : null}
        <Badge tone={complete ? 'success' : 'neutral'}>{complete ? 'Sudah dicatat server' : 'Belum selesai'}</Badge>
      </span>
    </div>
  )
}

/** Tonal grouping inside a card — spacing and background, never a divider rule. */
function InfoGroup({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-control bg-tonal p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      {children}
    </div>
  )
}

function ManualList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-foreground">
          <CircleAlert weight="fill" aria-hidden="true" className={`mt-1 ${iconSize.xs} shrink-0 text-muted-foreground`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function SetupWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stepParam = searchParams.get('step') || 'site'

  const [currentStepIndex, setCurrentStepIndex] = useState(
    Math.max(0, steps.findIndex((s) => s.id === stepParam)),
  )

  const { data: status, isLoading } = useQuery<SetupStatusResponse | null>({
    queryKey: ['setup', 'status'],
    queryFn: async () => {
      const res = await api<SetupStatusResponse>(API_ENDPOINTS.setup.status)
      return res.data || null
    },
  })

  useEffect(() => {
    const idx = steps.findIndex((s) => s.id === stepParam)
    if (idx >= 0) setCurrentStepIndex(idx)
  }, [stepParam])

  const currentStep = steps[currentStepIndex] || steps[0]
  const isLastStep = currentStepIndex === steps.length - 1

  function navigateToStep(idx: number) {
    if (idx >= 0 && idx < steps.length) {
      setCurrentStepIndex(idx)
      router.push(`/setup?step=${steps[idx].id}`)
    }
  }

  if (isLoading) {
    return <SetupWizardSkeleton />
  }

  const checks = status?.bootstrap?.checks ?? []
  const environmentReady = status?.bootstrap?.ready === true

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      {/* Header — a page-level rule is allowed here (this is not a card). */}
      <header className="flex min-h-[var(--layout-header)] shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-surface px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-module text-foreground">MuseCanvas</span>
          <Badge tone="accent">Panduan instalasi sistem</Badge>
        </div>
        {status?.setupComplete ? (
          <span className="text-sm text-muted-foreground">Sistem sudah selesai dikonfigurasi awal</span>
        ) : null}
      </header>

      {/* Stepper: horizontal from 640px (`sm`) up, vertical below it, labels always visible. */}
      <div className="shrink-0 border-b border-border bg-tonal px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-content">
          <Stepper
            steps={steps.map((step) => ({ id: step.id, label: step.label }))}
            current={currentStepIndex}
            onStepSelect={(index) => navigateToStep(index)}
            aria-label="Langkah panduan instalasi"
          />
        </div>
      </div>

      <main className="flex flex-1 justify-center px-4 py-6 sm:px-6">
        <div className="w-full max-w-form">
          <Card className="gap-6">
            <CardHeader className="gap-1">
              <CardTitle level={2}>{currentStep.label}</CardTitle>
              <CardDescription>
                Konfigurasi parameter infrastruktur inti untuk instance MuseCanvas ini; bisa diubah kapan saja dari admin panel.
              </CardDescription>
            </CardHeader>

            <CardBody className="gap-6">
              <p className="text-sm text-foreground">{currentStep.summary}</p>

              {currentStep.id === 'review' ? (
                <InfoGroup
                  title="Pemeriksaan lingkungan (hasil pembacaan server)"
                  caption={
                    status?.bootstrap
                      ? `Dibaca oleh server pada ${status.bootstrap.checkedAt.slice(0, 10)}; wizard ini sendiri tidak menjalankan pemeriksaan tersebut.`
                      : 'Server tidak mengembalikan hasil pemeriksaan lingkungan.'
                  }
                >
                  {status?.bootstrap ? (
                    <ul className="flex flex-col gap-2">
                      {checks.map((check) => {
                        const ok = check.status === 'ok'
                        return (
                          <li key={check.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                            <span className="text-sm text-foreground">{checkKeyLabel[check.key]}</span>
                            <Badge
                              tone={ok ? 'success' : check.status === 'missing' ? 'warning' : 'danger'}
                              icon={ok ? <Check weight="fill" /> : <CircleAlert weight="fill" />}
                            >
                              {ok ? 'Normal' : check.status === 'missing' ? 'Hilang' : 'Bermasalah'}
                            </Badge>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <Alert tone="warning" role="status">
                      Hasil pemeriksaan lingkungan tidak tersedia. Pastikan layanan API sudah berjalan, lalu buka lagi halaman ini.
                    </Alert>
                  )}

                  <div className="flex flex-col gap-2">
                    {steps.flatMap((step) => step.sections).map((sectionKey) => (
                      <SectionStatusLine
                        key={sectionKey}
                        sectionKey={sectionKey}
                        state={status?.sections?.[sectionKey]}
                      />
                    ))}
                  </div>
                </InfoGroup>
              ) : (
                <InfoGroup
                  title="Pemeriksaan aktual sistem"
                  caption="Status berikut dibaca dari catatan panduan server; wizard tidak menjalankan konfigurasi atau request apa pun atas namamu."
                >
                  <div className="flex flex-col gap-2">
                    {currentStep.sections.map((sectionKey) => (
                      <SectionStatusLine
                        key={sectionKey}
                        sectionKey={sectionKey}
                        state={status?.sections?.[sectionKey]}
                      />
                    ))}
                  </div>
                </InfoGroup>
              )}

              <InfoGroup
                title="Daftar periksa manual"
                caption="Wizard tidak memverifikasi hal berikut; silakan konfirmasi sendiri di halaman admin panel yang sesuai."
              >
                <ManualList items={currentStep.manual} />
              </InfoGroup>

              {currentStep.id === 'review' ? (
                environmentReady ? (
                  <Alert tone="success" role="status" title="Pemeriksaan lingkungan lolos">
                    Semua pemeriksaan lingkungan yang dicatat server sudah normal. Item yang masih perlu dikonfirmasi manual ada di status catatan panduan dan daftar periksa di atas.
                  </Alert>
                ) : (
                  <Alert tone="danger" role="alert" title="Pemeriksaan lingkungan belum lolos">
                    {status?.bootstrap
                      ? 'Setidaknya satu pemeriksaan lingkungan belum lolos; tangani dulu item yang ditandai hilang atau bermasalah di atas.'
                      : 'Server tidak mengembalikan hasil pemeriksaan lingkungan, jadi tidak bisa dipastikan apakah instance ini sudah siap jalan.'}
                  </Alert>
                )
              ) : null}

              {currentStep.id === 'review' ? (
                <div className="flex flex-wrap gap-3">
                  <Link href="/generate" className={buttonVariants({ variant: 'primary' })}>
                    Masuk ke meja kreasi
                  </Link>
                  <Link href="/admin" className={buttonVariants({ variant: 'secondary' })}>
                    Masuk ke admin panel
                  </Link>
                </div>
              ) : null}
            </CardBody>

            {/* Card footer actions: spacing separates them, no rule. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                onClick={() => navigateToStep(currentStepIndex - 1)}
                disabled={currentStepIndex === 0}
                icon={<ChevronLeft weight="bold" aria-hidden="true" className={iconSize.sm} />}
              >
                Langkah sebelumnya
              </Button>

              {!isLastStep ? (
                <Button
                  onClick={() => navigateToStep(currentStepIndex + 1)}
                  icon={
                    <ChevronRight weight="bold"
                      aria-hidden="true"
                      className={cn(`${iconSize.sm} order-2`)}
                    />
                  }
                >
                  Langkah berikutnya
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
