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
  title: 'MuseCanvas - Merapikan inspirasi menjadi gambar yang bisa di-generate',
  description: 'Meja kerja AI image generation untuk kreator: prompt, ukuran kanvas dan gambar referensi, antrean tugas, dan galeri karya tetap dalam satu jalur kreasi.',
}

const heroPrimary = buttonVariants({ variant: 'primary', size: 'lg' })
const heroGhost = buttonVariants({ variant: 'ghost', size: 'lg' })

const consoleSpecs: { label: string; value: string; mono?: boolean }[] = [
  // 断行策略：数字与单位、名与版本之间用不断行空格绑定；` / ` 与 ` · ` 两侧留普通空格，允许在分隔符处换行
  { label: 'Model generate', value: 'GPT Image 2.5 / Seedream 4.5', mono: true },
  { label: 'Ukuran kanvas', value: '1:1 · 16:9 · 9:16 · 4:3 · 3:4', mono: true },
  { label: 'Jumlah sekali jalan', value: '1 / 2 / 4 gambar', mono: true },
  { label: 'Gambar referensi', value: 'Maks. 4 gambar, PNG / JPEG', mono: true },
]

const capabilities = [
  {
    title: 'Prompt tidak perlu pakai template',
    description:
      'Cukup tulis subjek, suasana, material, pencahayaan, dan elemen yang ingin dihindari. Template gaya dikelola seragam dari sisi sistem, tidak perlu dipilih manual sebelum submit.',
    icon: WandSparkles,
  },
  {
    title: 'Model, ukuran kanvas, dan gambar referensi',
    description:
      'Ganti model, 5 ukuran kanvas, dan jumlah sekali jalan dalam satu panel yang sama, lalu unggah gambar referensi PNG atau JPEG sebagai acuan komposisi dan gaya.',
    icon: Layers3,
  },
  {
    title: 'Antre, retry, dan batal',
    description:
      'Setelah disubmit, tugas masuk antrean dan dieksekusi berurutan; bila gagal akan di-retry otomatis. Bisa juga menjalankan ulang manual hanya tugas yang gagal, atau membatalkan sebelum selesai.',
    icon: Repeat,
  },
  {
    title: 'Karya tersimpan otomatis',
    description:
      'Hasil generate otomatis masuk ke galeri. Atur kerapatan grid, perbesar untuk membandingkan detail, unduh gambar asli, atau hapus versi yang tidak diinginkan — satu per satu atau sekaligus.',
    icon: Library,
  },
  {
    title: 'Login pakai kode verifikasi',
    description:
      'Terima kode 6 digit lewat email lalu langsung masuk, tidak perlu mengingat password lagi. Mendukung juga akun GitHub dan Google. Pihak yang men-deploy bisa menggantinya ke pendaftaran kode undangan.',
    icon: Mail,
  },
  {
    title: 'Self-hosted dan admin panel',
    description:
      'Selesaikan konfigurasi deploy lewat panduan inisialisasi; tugas, pengguna, model dan supplier, template prompt, dan OAuth masing-masing punya halaman pengelolaannya sendiri.',
    icon: ShieldCheck,
  },
]

const workflowSteps = [
  {
    title: 'Tuliskan gambarnya',
    description: 'Deskripsikan komposisi dan suasana dengan bahasa alami; bila ingin melanjutkan nuansa sebuah gambar, unggah gambar itu langsung sebagai gambar referensi.',
    icon: PenLine,
  },
  {
    title: 'Tentukan output',
    description: 'Pilih model, ukuran kanvas, dan jumlah sekali jalan; setelah disubmit, tugas masuk antrean dan status setiap tugas bisa diikuti dari meja kreasi.',
    icon: SlidersHorizontal,
  },
  {
    title: 'Lihat kembali dan unduh',
    description: 'Setelah selesai, hasil otomatis muncul di galeri; lihat berdasarkan waktu, perbesar untuk membandingkan, unduh gambar asli, atau hapus versi yang kurang cocok.',
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
                  Merapikan inspirasi menjadi gambar yang bisa di-generate
                </p>

                <p className="mt-6 max-w-xl text-base text-muted-foreground [text-wrap:pretty]">
                  Dari prompt, model, dan ukuran kanvas, sampai antrean tugas dan galeri karya — setiap langkah dalam sekali generate tetap berada dalam satu jalur kreasi yang jelas.
                </p>

                {/* CTA 成对：primary（墨色）+ ghost */}
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <Link href="/login" className={heroPrimary}>
                    Mulai berkarya
                    <ArrowRight weight="bold" aria-hidden="true" />
                  </Link>
                  <Link href="#workflow" className={heroGhost}>
                    Lihat alur kreasi
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
                    Sekilas meja kreasi
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
                <h1 className="text-title text-foreground">Kemampuan produk</h1>
                <h2
                  id="capabilities-title"
                  className="mt-3 text-section text-foreground [line-break:strict] [text-wrap:balance]"
                >
                  Semua langkah dalam sekali generate, terkumpul dalam satu meja kerja
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
                <h1 className="text-title text-foreground">Alur kreasi</h1>
                <h2
                  id="workflow-title"
                  className="mt-3 text-section text-foreground [line-break:strict] [text-wrap:balance]"
                >
                  Inspirasi tidak dimasukkan ke formulir, melainkan ke dalam alur
                </h2>
                <p className="mt-4 text-base text-muted-foreground [text-wrap:pretty]">
                  Setelah login, yang terbuka bukan tumpukan fitur admin, melainkan ruang kerja generate yang fokus: mendeskripsikan gambar, menentukan output, melihat hasil — tiga langkah tanpa ada state perantara yang harus dipindah-pindah.
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
                Siap membuat deskripsi pertamamu menjadi nyata?
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground [text-wrap:pretty]">
                Setelah login, langsung masuk ke meja kreasi: tulis prompt, pilih ukuran kanvas dan jumlahnya, dan karya yang dihasilkan langsung muncul di galerimu.
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Link href="/login" className={heroPrimary}>
                  Masuk ke MuseCanvas
                  <ArrowRight weight="bold" aria-hidden="true" />
                </Link>
                <Link href="/terms" className={heroGhost}>
                  Baca syarat pengguna dulu
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
