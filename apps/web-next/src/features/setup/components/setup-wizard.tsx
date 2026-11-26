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
    label: 'Site configuration',
    sections: ['site'],
    summary: 'Site configuration covers the service domain (e.g. https://musecanvas.example.com) and the public access endpoint.',
    manual: [
      'The server BASE_URL environment variable already points to this instance’s public address.',
      'The site name and address will be used for emails, OAuth callbacks, and share links.',
    ],
  },
  {
    id: 'smtp',
    label: 'SMTP email & admin',
    sections: ['smtp', 'admin'],
    summary: 'Configure the sender SMTP server to send email login OTP codes to users, then create the first admin account.',
    manual: [
      'Send tests are done on the system configuration page in the admin panel; this wizard itself sends no emails.',
      'In a dev environment, OTP codes can be read directly from the backend console output, without sending email for debugging.',
    ],
  },
  {
    id: 'storage',
    label: 'Object storage (S3)',
    sections: ['storage'],
    summary: 'Object storage (S3-compatible, Alibaba Cloud OSS, Tencent Cloud COS, Cloudflare R2, local MinIO) is used to persistently store users’ generated image assets.',
    manual: [
      'Bucket credentials are written on the system configuration page in the admin panel; the wizard neither reads nor writes any objects.',
      'The worker will upload assets to the destination bucket after generation finishes, then publish the access URL.',
    ],
  },
  {
    id: 'providers',
    label: 'AI models & providers',
    sections: ['providers', 'models'],
    summary: 'Configure credentials for the upstream generation model services (e.g. OpenAI DALL·E 3, Seedream Volcengine, Anthropic Claude, Google Veo).',
    manual: [
      'More API keys can be added after the guide finishes, from the admin panel, along with rates and usage quotas.',
      'The wizard calls no upstream APIs and does not validate whether a key works.',
    ],
  },
  {
    id: 'review',
    label: 'Environment check & finish',
    sections: ['oauth', 'templates', 'runtime'],
    summary: 'A summary of the environment check results recorded by the server at startup, plus guide items that are not yet done.',
    manual: ['"Environment check" below comes from the server’s readings; the other items need to be confirmed one by one manually.'],
  },
]

export function SetupWizardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-foreground" role="status" aria-busy="true">
      <span className="sr-only">Loading system configuration status</span>
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
  database: 'Database connection',
  redis: 'Redis Streams queue',
  masterKey: 'Master key (HKDF)',
  runtime: 'Runtime limits',
}

function sectionLabel(key: OnboardingSectionKey): string {
  return {
    bootstrap: 'Environment guide',
    site: 'Site info',
    smtp: 'SMTP email',
    admin: 'Admin account',
    storage: 'Object storage',
    providers: 'Model providers',
    models: 'Generation models',
    oauth: 'OAuth login',
    templates: 'Prompt templates',
    runtime: 'Runtime limits',
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
        <Badge tone={complete ? 'success' : 'neutral'}>{complete ? 'Recorded by server' : 'Not done yet'}</Badge>
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
          <Badge tone="accent">System installation guide</Badge>
        </div>
        {status?.setupComplete ? (
          <span className="text-sm text-muted-foreground">Initial system configuration is complete</span>
        ) : null}
      </header>

      {/* Stepper: horizontal from 640px (`sm`) up, vertical below it, labels always visible. */}
      <div className="shrink-0 border-b border-border bg-tonal px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-content">
          <Stepper
            steps={steps.map((step) => ({ id: step.id, label: step.label }))}
            current={currentStepIndex}
            onStepSelect={(index) => navigateToStep(index)}
            aria-label="Installation guide steps"
          />
        </div>
      </div>

      <main className="flex flex-1 justify-center px-4 py-6 sm:px-6">
        <div className="w-full max-w-form">
          <Card className="gap-6">
            <CardHeader className="gap-1">
              <CardTitle level={2}>{currentStep.label}</CardTitle>
              <CardDescription>
                Configure the core infrastructure parameters for this MuseCanvas instance; they can be changed at any time from the admin panel.
              </CardDescription>
            </CardHeader>

            <CardBody className="gap-6">
              <p className="text-sm text-foreground">{currentStep.summary}</p>

              {currentStep.id === 'review' ? (
                <InfoGroup
                  title="Environment check (server readings)"
                  caption={
                    status?.bootstrap
                      ? `Read by the server on ${status.bootstrap.checkedAt.slice(0, 10)}; this wizard does not run the check itself.`
                      : 'The server returned no environment check results.'
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
                              {ok ? 'OK' : check.status === 'missing' ? 'Missing' : 'Failing'}
                            </Badge>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <Alert tone="warning" role="status">
                      Environment check results are unavailable. Make sure the API service is running, then reopen this page.
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
                  title="Actual system checks"
                  caption="The status below is read from the server’s onboarding records; the wizard runs no configuration or requests on your behalf."
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
                title="Manual checklist"
                caption="The wizard does not verify the following; confirm them yourself on the matching admin panel page."
              >
                <ManualList items={currentStep.manual} />
              </InfoGroup>

              {currentStep.id === 'review' ? (
                environmentReady ? (
                  <Alert tone="success" role="status" title="Environment check passed">
                    All environment checks recorded by the server are normal. Items that still need manual confirmation are in the onboarding record status and the checklist above.
                  </Alert>
                ) : (
                  <Alert tone="danger" role="alert" title="Environment check not passed yet">
                    {status?.bootstrap
                      ? 'At least one environment check has not passed yet; handle the items marked missing or failing above first.'
                      : 'The server returned no environment check results, so it cannot be confirmed whether this instance is ready to run.'}
                  </Alert>
                )
              ) : null}

              {currentStep.id === 'review' ? (
                <div className="flex flex-wrap gap-3">
                  <Link href="/generate" className={buttonVariants({ variant: 'primary' })}>
                    Go to the creation console
                  </Link>
                  <Link href="/admin" className={buttonVariants({ variant: 'secondary' })}>
                    Go to the admin panel
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
                Previous step
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
                  Next step
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
