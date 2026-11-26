import Link from 'next/link'
import {
  ArrowRightIcon as ArrowRight,
  DownloadSimpleIcon as Download,
  StackIcon as Layers3,
  ImagesSquareIcon as Library,
  EnvelopeSimpleIcon as Mail,
  PencilLineIcon as PenLine,
  ArrowsClockwiseIcon as Repeat,
  ShieldCheckIcon as ShieldCheck,
  SlidersHorizontalIcon as SlidersHorizontal,
  MagicWandIcon as WandSparkles,
} from '@phosphor-icons/react/ssr'
import { Reveal } from '@/shared/components/reveal'
import { Card, CardBody, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PublicHeader } from '@/shared/components/public-header'
import { SiteFooter } from '@/shared/components/site-footer'
// `button-variants` is the directive-free half of the button primitive, which is
// the whole reason this page can use it: a server component may render a client
// module but never *call* its exports, so `buttonVariants` is imported from the
// recipe module instead of mirrored here.
import { buttonVariants } from '@/shared/components/ui/button-variants'
import { cn } from '@/shared/lib/cn'
import { iconSize } from '@/shared/components/ui'

export const dynamic = 'force-static'

export const metadata = {
  title: 'MuseCanvas - Turn inspiration into images you can generate',
  description: 'An AI image generation workspace for creators: prompts, canvas sizes and reference images, task queue, and work gallery — all in one creative flow.',
}

const heroPrimary = buttonVariants({ variant: 'primary', size: 'lg' })
const heroGhost = buttonVariants({ variant: 'ghost', size: 'lg' })

const consoleSpecs: { label: string; value: string; mono?: boolean }[] = [
  // 断行策略：数字与单位、名与版本之间用不断行空格绑定；` / ` 与 ` · ` 两侧留普通空格，允许在分隔符处换行
  { label: 'Generation models', value: 'GPT Image 2.5 / Seedream 4.5', mono: true },
  { label: 'Canvas sizes', value: '1:1 · 16:9 · 9:16 · 4:3 · 3:4', mono: true },
  { label: 'Images per run', value: '1 / 2 / 4 images', mono: true },
  { label: 'Reference images', value: 'Max. 4 images, PNG / JPEG', mono: true },
]

const capabilities = [
  {
    title: 'Prompts need no template',
    description:
      'Just write the subject, mood, materials, lighting, and elements to avoid. Style templates are managed uniformly by the system — no manual selection before submit.',
    icon: WandSparkles,
  },
  {
    title: 'Models, canvas sizes, and reference images',
    description:
      'Switch models, 5 canvas sizes, and images per run in a single panel, then upload PNG or JPEG reference images as guides for composition and style.',
    icon: Layers3,
  },
  {
    title: 'Queue, retry, and cancel',
    description:
      'After submit, tasks enter the queue and run in order; failures are retried automatically. You can also manually retry only the failed tasks, or cancel before they finish.',
    icon: Repeat,
  },
  {
    title: 'Works save automatically',
    description:
      'Generated results go straight into the gallery. Adjust the grid density, zoom in to compare details, download the original image, or delete unwanted versions — one by one or in bulk.',
    icon: Library,
  },
  {
    title: 'Log in with a verification code',
    description:
      'Receive a 6-digit code by email and sign straight in — no password to remember. GitHub and Google accounts are supported too. Deployers can switch it to invitation-code registration.',
    icon: Mail,
  },
  {
    title: 'Self-hosted with an admin panel',
    description:
      'Finish the deployment setup through the initialization guide; tasks, users, models and providers, prompt templates, and OAuth each have their own management page.',
    icon: ShieldCheck,
  },
]

const workflowSteps = [
  {
    title: 'Describe the image',
    description: 'Describe the composition and mood in natural language; to continue the feel of an existing image, upload it directly as a reference image.',
    icon: PenLine,
  },
  {
    title: 'Choose the output',
    description: 'Pick the model, canvas size, and images per run; after submit, tasks enter the queue and each task’s status can be followed from the creation console.',
    icon: SlidersHorizontal,
  },
  {
    title: 'Review and download',
    description: 'When done, results appear automatically in the gallery; browse by time, zoom in to compare, download the original image, or delete versions that don’t fit.',
    icon: Download,
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas text-foreground antialiased">
      <PublicHeader current="landing" />

      <main>
        {/* Hero：营销模式 — 上下 96px（桌面）/ 64px（手机），内容 `max-w-content` 居中 */}
        <Reveal trigger="load">
          <section className="scroll-mt-16">
            <div className="mx-auto grid w-full max-w-content items-start gap-12 px-4 py-16 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)] lg:py-24">
              <div className="max-w-2xl">
                <h1 className="text-display text-foreground">MuseCanvas</h1>
                {/* 副标题是 20px 的 subtitle + secondary 色，不再继承 Display */}
                <p className="mt-4 text-subtitle text-muted-foreground [line-break:strict] [text-wrap:balance]">
                  Turn inspiration into images you can generate
                </p>

                <p className="mt-6 max-w-xl text-base text-muted-foreground [text-wrap:pretty]">
                  From prompt, model, and canvas size to task queue and work gallery — every step of a generation stays in one clear creative flow.
                </p>

                {/* CTA 成对：primary（墨色）+ ghost */}
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Link href="/login" className={heroPrimary}>
                    Start creating
                    <ArrowRight weight="bold" aria-hidden="true" />
                  </Link>
                  <Link href="#workflow" className={heroGhost}>
                    See the creative flow
                  </Link>
                </div>
              </div>

              {/* Console overview — 参数为创作台当前真实可选项 */}
              <aside
                aria-labelledby="console-overview-title"
                className="overflow-hidden rounded-panel bg-surface shadow-soft"
              >
                <div className="flex items-baseline justify-between gap-4 px-6 pb-4 pt-5">
                  <h2 id="console-overview-title" className="whitespace-nowrap text-sm font-medium text-foreground">
                    Creation console at a glance
                  </h2>
                  <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">/generate</span>
                </div>

                <dl className="mx-6 pb-5">
                  {consoleSpecs.map((spec) => (
                    <div
                      key={spec.label}
                      className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[5.5rem_1fr] sm:gap-4"
                    >
                      <dt className="whitespace-nowrap text-sm text-muted-foreground">{spec.label}</dt>
                      <dd
                        className={cn(
                          'text-sm text-foreground',
                          spec.mono ? 'font-mono tabular-nums' : '[text-wrap:pretty]',
                        )}
                      >
                        {spec.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </div>
          </section>
        </Reveal>

        {/* Capabilities：卡片网格 2–3 列，间距 32px，卡片为图标 + 标题 + 描述 */}
        <section id="capabilities" aria-labelledby="capabilities-title" className="scroll-mt-16">
          <Reveal>
            <div className="mx-auto w-full max-w-content px-4 py-16 sm:px-6 lg:py-24">
              <header className="max-w-3xl">
                <h1 className="text-title text-foreground">Product capabilities</h1>
                <h2
                  id="capabilities-title"
                  className="mt-3 text-section text-foreground [line-break:strict] [text-wrap:balance]"
                >
                  Every step of a generation, gathered in one workspace
                </h2>
              </header>

              <ul className="mt-10 grid gap-8 sm:grid-cols-2 md:grid-cols-3">
                {capabilities.map((capability) => {
                  const Icon = capability.icon
                  return (
                    <li key={capability.title}>
                      <Card className="h-full">
                        <Icon weight="duotone" className={`${iconSize.lg} text-muted-foreground`} aria-hidden="true" />
                        <CardHeader>
                          <CardTitle level={3}>{capability.title}</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <p className="text-sm text-muted-foreground [text-wrap:pretty]">{capability.description}</p>
                        </CardBody>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* Workflow：surface 台阶把这一段从画布上分开，区块之间仍是 64–96px */}
        <section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-16 bg-surface">
          <Reveal>
            <div className="mx-auto grid w-full max-w-content gap-12 px-4 py-16 sm:px-6 md:grid-cols-[0.8fr_1fr] lg:py-24">
              <div className="max-w-xl">
                <h1 className="text-title text-foreground">Creative flow</h1>
                <h2
                  id="workflow-title"
                  className="mt-3 text-section text-foreground [line-break:strict] [text-wrap:balance]"
                >
                  Inspiration goes into a flow, not a form
                </h2>
                <p className="mt-4 text-base text-muted-foreground [text-wrap:pretty]">
                  After login, what opens is not a pile of admin features but a focused generation workspace: describe the image, choose the output, see the result — three steps with no intermediate state to move around.
                </p>
              </div>

              <ul className="grid gap-8">
                {workflowSteps.map((step) => {
                  const StepIcon = step.icon
                  return (
                    <li key={step.title} className="flex min-w-0 flex-col gap-1">
                      <h3 className="flex items-center gap-2 text-subtitle text-foreground [line-break:strict]">
                        <StepIcon weight="duotone" className={`${iconSize.md} shrink-0 text-muted-foreground`} aria-hidden="true" />
                        {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground [text-wrap:pretty]">{step.description}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* CTA：tonal 底色分区，居中排版 */}
        <section aria-labelledby="cta-title" className="bg-tonal">
          <Reveal>
            <div className="mx-auto flex w-full max-w-content flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:py-24">
              <h2 id="cta-title" className="text-section text-foreground [line-break:strict] [text-wrap:balance]">
                Ready to turn your first description into reality?
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground [text-wrap:pretty]">
                After login, go straight to the creation console: write a prompt, pick a canvas size and count, and your generated works appear in your gallery right away.
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Link href="/login" className={heroPrimary}>
                  Enter MuseCanvas
                  <ArrowRight weight="bold" aria-hidden="true" />
                </Link>
                <Link href="/terms" className={heroGhost}>
                  Read the terms of use first
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter current="landing" />
    </div>
  )
}
