'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import { requireAdminData } from '../lib/admin-query'
import { adminSettingsDraftChanged, hasNewerAdminSettingsRevision, requireVerifiedAdminSettings } from '../lib/admin-settings-state'
import type {
  RuntimeSettingsDto,
  RuntimeSettingsInput,
  SetupConfigResponse,
  SetupSmtpTestResult,
  SetupStorageTestResult,
  SiteSettingsDto,
  SiteSettingsInput,
  SmtpConnectionStatus,
  SmtpSettingsDto,
  SmtpSettingsInput,
  SmtpTlsMode,
  StorageConnectionStatus,
  StorageSettingsDto,
  StorageSettingsInput,
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
  Dialog,
  FieldGroup,
  FormField,
  Input,
  PageHeader,
  Select,
  SkeletonRow,
  SkeletonText,
  SkeletonTile,
  Tabs,
  iconSize,
} from '@/shared/components/ui'
import type { BadgeTone } from '@/shared/components/ui'
import { cn } from '@/shared/lib/cn'
import { DatabaseIcon as Database, GlobeIcon as Globe, EnvelopeSimpleIcon as Mail, ArrowClockwiseIcon as RefreshCw, SlidersHorizontalIcon as SlidersHorizontal } from '@phosphor-icons/react'

const settingsQueryKey = ['admin', 'settings'] as const

interface Feedback {
  ok: boolean
  msg: string
}

interface SectionState { dirty: boolean; busy: boolean }
type SectionStateReporter = (section: SectionId, state: SectionState) => void

function SettingsSectionFeedback({ feedback, newerRevision, dirty, busy, onReload }: {
  feedback: Feedback | null; newerRevision: boolean; dirty: boolean; busy: boolean; onReload: () => void
}) {
  const [confirmReload, setConfirmReload] = useState(false)
  return <>
    {feedback && <Alert tone={feedback.ok ? 'success' : 'danger'} role={feedback.ok ? 'status' : 'alert'}>{feedback.msg}</Alert>}
    {newerRevision && <Alert tone="info" title="Server configuration updated" action={
      <Button variant="secondary" disabled={busy} onClick={() => { if (dirty) setConfirmReload(true); else onReload() }}>Reload this section</Button>
    }>The current draft and the loaded baseline are both kept. Reloading adopts the new server version and clears sensitive inputs in this section.</Alert>}
    <Dialog open={confirmReload} onClose={() => setConfirmReload(false)} title="Discard draft and reload?" size="narrow" panelClassName="max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]" footer={<>
      <Button variant="ghost" disabled={busy} onClick={() => setConfirmReload(false)}>Keep draft</Button>
      <Button variant="danger" disabled={busy} onClick={() => { onReload(); setConfirmReload(false) }}>Discard draft and load</Button>
    </>}><p className="text-sm">This section still has unsaved content. Reloading replaces this draft and clears secret inputs; other sections are unaffected.</p></Dialog>
  </>
}

/**
 * 设置页 layout (components.md 场景模式 → 设置页): a 240px group nav on the left and
 * one segmented panel on the right, with the save bar sticky at the bottom.
 *
 * The rail is `--container-settings-nav` (240px), which is its own token rather
 * than `--container-sidebar` (260px): the spec's settings nav lists section names,
 * not the admin sidebar's icon+label rows. It only applies from `md` (960px) up;
 * below that the same selection collapses to `Tabs variant="segment"`.
 */
type SectionId = 'site' | 'smtp' | 'storage' | 'runtime'

const sectionGroups: Array<{
  title: string
  items: Array<{ id: SectionId; label: string; icon: typeof Globe }>
}> = [
  { title: 'Site', items: [{ id: 'site', label: 'Site information', icon: Globe }] },
  {
    title: 'External services',
    items: [
      { id: 'smtp', label: 'SMTP email service', icon: Mail },
      { id: 'storage', label: 'Object storage', icon: Database },
    ],
  },
  { title: 'Runtime parameters', items: [{ id: 'runtime', label: 'Runtime limits', icon: SlidersHorizontal }] },
]

const connectionStatusTone: Record<SmtpConnectionStatus | StorageConnectionStatus, BadgeTone> = {
  not_configured: 'neutral',
  configured: 'warning',
  verified: 'success',
  error: 'danger',
}

const connectionStatusLabel: Record<SmtpConnectionStatus | StorageConnectionStatus, string> = {
  not_configured: 'Not configured',
  configured: 'Saved, pending verification',
  verified: 'Verified',
  error: 'Connection error',
}

// Empty inputs are omitted so the server keeps the stored value instead of clearing it.
function keepIfEmpty(raw: string): string | undefined {
  return raw.trim() === '' ? undefined : raw.trim()
}

function keepIfEmptyNumber(raw: string): number | undefined {
  return raw.trim() === '' ? undefined : Number(raw)
}

function ConnectionBadge({ status }: { status: SmtpConnectionStatus | StorageConnectionStatus }) {
  return <Badge tone={connectionStatusTone[status]}>{connectionStatusLabel[status]}</Badge>
}

/** Section header: title + description on the left, status metadata on the right. */
function SectionHeader({
  title,
  description,
  status,
}: {
  title: string
  description: string
  status?: React.ReactNode
}) {
  return (
    <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <CardTitle level={2}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {status ? <div className="flex shrink-0 items-center gap-2">{status}</div> : null}
    </CardHeader>
  )
}

/**
 * 危险操作区 (components.md 场景模式 → 设置页): its own block at the bottom of the
 * segment — a 4px danger bar on the `danger-soft` surface. It sits between cards,
 * never inside one, so no divider rule is needed.
 */
function DangerZone({ description, children }: { description: string; children: React.ReactNode }) {
  return (
    <section
      aria-label="Danger zone"
      className="flex flex-col gap-4 rounded-card border border-danger-border bg-danger-soft p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-module text-danger">Danger zone</h3>
        <p className="max-w-reading text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

/**
 * Sticky save bar (设置页 footer): 取消 ghost + 保存 primary. The buttons submit the
 * segment's form through its `id`, so each section keeps its own mutation.
 */
function SaveBar({
  formId,
  dirty,
  saving,
  busy,
  onCancel,
}: {
  formId: string
  dirty: boolean
  saving: boolean
  busy: boolean
  onCancel: () => void
}) {
  return (
    <div className="sticky bottom-0 z-sticky flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4 shadow-soft">
      <p className="text-sm text-muted-foreground">{busy ? 'A section operation is in progress; the form is locked.' : dirty ? 'There are unsaved changes.' : 'There are no changes to submit.'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" className="min-h-[var(--control-lg)] md:min-h-[var(--control-md)]" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="min-h-[var(--control-lg)] md:min-h-[var(--control-md)]" form={formId} loading={saving} disabled={busy || !dirty}>
          Save
        </Button>
      </div>
    </div>
  )
}

const FORM_ID = {
  site: 'admin-settings-site-form',
  smtp: 'admin-settings-smtp-form',
  storage: 'admin-settings-storage-form',
  runtime: 'admin-settings-runtime-form',
} as const

const updatedAtStatus = (updatedAt: string) => (
  <p className="text-xs text-muted-foreground">Updated {updatedAt.slice(0, 10)}</p>
)

function SiteSection({
  settings: latestSettings,
  onStateChange,
}: {
  settings: SiteSettingsDto
  onStateChange: SectionStateReporter
}) {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(latestSettings)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [siteName, setSiteName] = useState(settings.siteName ?? '')
  const [siteUrl, setSiteUrl] = useState(settings.siteUrl ?? '')

  const dirty = siteName.trim() !== (settings.siteName ?? '') || (siteUrl.trim() || null) !== (settings.siteUrl ?? null)

  const save = useMutation({
    mutationFn: async () => {
      const body: SiteSettingsInput = {
        siteName: siteName.trim(),
        siteUrl: siteUrl.trim() || null,
      }
      if (!body.siteName) throw new Error('Please enter a site name')
      const res = await api<SiteSettingsDto>(API_ENDPOINTS.setup.site, { method: 'POST', body })
      if (!res.success) throw new Error(res.error?.message || 'Failed to save site settings')
      return requireAdminData(res, 'Save response is missing configuration data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'Site settings saved' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'Failed to save site settings' }),
  })

  function reset() {
    setSiteName(settings.siteName ?? '')
    setSiteUrl(settings.siteUrl ?? '')
  }

  function loadSettings(next: SiteSettingsDto) {
    setSettings(next)
    setFeedback(null)
    setSiteName(next.siteName ?? '')
    setSiteUrl(next.siteUrl ?? '')
  }

  const busy = save.isPending
  useEffect(() => { onStateChange('site', { dirty, busy }) }, [dirty, busy, onStateChange])

  return (
    <>
      <SettingsSectionFeedback feedback={feedback} newerRevision={hasNewerAdminSettingsRevision(settings, latestSettings)} dirty={dirty} busy={busy} onReload={() => loadSettings(latestSettings)} />
      <Card className="gap-6">
        <SectionHeader
          title="Site information"
          description="The instance public URL used in emails, OAuth callbacks, and share links."
          status={updatedAtStatus(settings.updatedAt)}
        />
        <form
          id={FORM_ID.site}
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && dirty) save.mutate()
          }}
        >
          <fieldset disabled={busy} className="min-w-0">
            <FieldGroup>
              <FormField label="Site name" required hint="Shown in the title, emails, and page metadata; max 120 characters.">
                <Input type="text" maxLength={120} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </FormField>
              <FormField
                label="Site URL (optional)"
                hint="Must be an HTTPS root URL without a path, query parameters, or credentials; leave empty to fall back to the address derived from server environment variables."
              >
                <Input
                  type="text"
                  placeholder="https://musecanvas.example.com"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                />
              </FormField>
            </FieldGroup>
          </fieldset>
        </form>
      </Card>
      <SaveBar formId={FORM_ID.site} dirty={dirty} saving={save.isPending} busy={busy} onCancel={reset} />
    </>
  )
}

function SmtpSection({
  settings: latestSettings,
  onStateChange,
}: {
  settings: SmtpSettingsDto
  onStateChange: SectionStateReporter
}) {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(latestSettings)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [host, setHost] = useState(settings.host ?? '')
  const [port, setPort] = useState(settings.port === null ? '' : String(settings.port ?? ''))
  const [tlsMode, setTlsMode] = useState<SmtpTlsMode>(settings.tlsMode)
  const [username, setUsername] = useState(settings.username ?? '')
  const [password, setPassword] = useState('')
  const [fromAddress, setFromAddress] = useState(settings.fromAddress ?? '')
  const [fromName, setFromName] = useState(settings.fromName ?? '')

  const portBaseline = settings.port === null ? '' : String(settings.port ?? '')
  const dirty = adminSettingsDraftChanged(toInput(), settings)

  // The password field is write-only: an untouched input is omitted so the stored
  // secret survives, while sending an empty string would wipe it.
  function toInput(): SmtpSettingsInput {
    return {
      host: keepIfEmpty(host),
      port: keepIfEmptyNumber(port),
      tlsMode: tlsMode === settings.tlsMode ? undefined : tlsMode,
      username: keepIfEmpty(username),
      password: password.trim() || undefined,
      fromAddress: keepIfEmpty(fromAddress),
      fromName: keepIfEmpty(fromName),
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await api<SmtpSettingsDto>(API_ENDPOINTS.setup.smtp, { method: 'POST', body: toInput() })
      if (!res.success) throw new Error(res.error?.message || 'Failed to save SMTP settings')
      return requireAdminData(res, 'Save response is missing configuration data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'SMTP settings saved; verifying the connection is recommended — saving alone does not mean mail can be delivered.' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'Failed to save SMTP settings' }),
  })

  const test = useMutation({
    mutationFn: async () => {
      const res = await api<SetupSmtpTestResult>(API_ENDPOINTS.setup.smtpTest, {
        method: 'POST',
        body: toInput(),
      })
      return requireVerifiedAdminSettings(res, 'SMTP connection verification failed or the response is missing settings data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'The current draft passed SMTP connection verification and the settings were saved; this test sends no email and does not guarantee delivery.' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'SMTP connectivity test failed' }),
  })

  function reset() {
    setHost(settings.host ?? '')
    setPort(portBaseline)
    setTlsMode(settings.tlsMode)
    setUsername(settings.username ?? '')
    setPassword('')
    setFromAddress(settings.fromAddress ?? '')
    setFromName(settings.fromName ?? '')
  }

  function loadSettings(next: SmtpSettingsDto) {
    setSettings(next)
    setFeedback(null)
    setHost(next.host ?? '')
    setPort(next.port === null ? '' : String(next.port ?? ''))
    setTlsMode(next.tlsMode)
    setUsername(next.username ?? '')
    setPassword('')
    setFromAddress(next.fromAddress ?? '')
    setFromName(next.fromName ?? '')
  }

  const busy = save.isPending || test.isPending
  useEffect(() => { onStateChange('smtp', { dirty, busy }) }, [dirty, busy, onStateChange])

  return (
    <>
      <SettingsSectionFeedback feedback={feedback} newerRevision={hasNewerAdminSettingsRevision(settings, latestSettings)} dirty={dirty} busy={busy} onReload={() => loadSettings(latestSettings)} />
      <Card className="gap-6">
        <SectionHeader
          title="SMTP email service"
          description="Used to send login verification codes and notification emails."
          status={<ConnectionBadge status={settings.status} />}
        />
        <form
          id={FORM_ID.smtp}
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && dirty) save.mutate()
          }}
        >
          <fieldset disabled={busy} className="min-w-0">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="SMTP server" hint="Leave empty to keep the current value.">
                <Input type="text" placeholder="smtp.example.com" value={host} onChange={(e) => setHost(e.target.value)} />
              </FormField>
              <FormField label="Port">
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  placeholder={settings.port === null ? '465' : String(settings.port)}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                />
              </FormField>
              <FormField label="Encryption">
                <Select value={tlsMode} onChange={(e) => setTlsMode(e.target.value as SmtpTlsMode)}>
                  <option value="implicit_tls">Implicit TLS (465)</option>
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="none">No encryption</option>
                </Select>
              </FormField>
              <FormField label="Login username">
                <Input
                  type="text"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </FormField>
              <FormField
                label="Login password / authorization code"
                hint={settings.hasSecret ? 'A secret is configured; leave empty to keep it.' : 'Secrets are write-only and are never shown again.'}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={settings.hasSecret ? '••••••••' : 'Not set'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </FormField>
              <FormField label="From address">
                <Input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} />
              </FormField>
              <FormField label="From name">
                <Input type="text" maxLength={120} value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </FormField>
            </div>
          </fieldset>
        </form>
      </Card>

      <DangerZone description="Verifies the current draft's SMTP connection without sending email; settings are saved only if the connection succeeds, and not saved if it fails. The test really connects to the external service; after a successful save, the login secret may be overwritten and the old value cannot be retrieved.">
        <Button variant="secondary" loading={test.isPending} disabled={busy} onClick={() => { if (!busy) test.mutate() }}>
          Verify SMTP connection
        </Button>
      </DangerZone>

      <SaveBar formId={FORM_ID.smtp} dirty={dirty} saving={save.isPending} busy={busy} onCancel={reset} />
    </>
  )
}

function StorageSection({
  settings: latestSettings,
  onStateChange,
}: {
  settings: StorageSettingsDto
  onStateChange: SectionStateReporter
}) {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(latestSettings)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [endpoint, setEndpoint] = useState(settings.endpoint ?? '')
  const [publicEndpoint, setPublicEndpoint] = useState(settings.publicEndpoint ?? '')
  const [region, setRegion] = useState(settings.region)
  const [bucket, setBucket] = useState(settings.bucket ?? '')
  const [accessKeyId, setAccessKeyId] = useState(settings.accessKeyId ?? '')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [signedUrlTtlSeconds, setSignedUrlTtlSeconds] = useState(String(settings.signedUrlTtlSeconds))

  const dirty = adminSettingsDraftChanged(toInput(), settings)

  function toInput(): StorageSettingsInput {
    return {
      endpoint: keepIfEmpty(endpoint),
      publicEndpoint: keepIfEmpty(publicEndpoint),
      region: keepIfEmpty(region),
      bucket: keepIfEmpty(bucket),
      accessKeyId: keepIfEmpty(accessKeyId),
      secretAccessKey: secretAccessKey.trim() || undefined,
      signedUrlTtlSeconds: keepIfEmptyNumber(signedUrlTtlSeconds),
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await api<StorageSettingsDto>(API_ENDPOINTS.setup.storage, { method: 'POST', body: toInput() })
      if (!res.success) throw new Error(res.error?.message || 'Failed to save object storage settings')
      return requireAdminData(res, 'Save response is missing configuration data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'Object storage settings saved; run a connectivity test to complete verification.' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'Failed to save object storage settings' }),
  })

  const test = useMutation({
    mutationFn: async () => {
      const res = await api<SetupStorageTestResult>(API_ENDPOINTS.setup.storageTest, {
        method: 'POST',
        body: toInput(),
      })
      return requireVerifiedAdminSettings(res, 'Object storage connectivity test failed or the response is missing settings data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'The current draft passed the object storage connectivity test; the settings were saved and marked as verified.' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'Object storage connectivity test failed' }),
  })

  function reset() {
    setEndpoint(settings.endpoint ?? '')
    setPublicEndpoint(settings.publicEndpoint ?? '')
    setRegion(settings.region)
    setBucket(settings.bucket ?? '')
    setAccessKeyId(settings.accessKeyId ?? '')
    setSecretAccessKey('')
    setSignedUrlTtlSeconds(String(settings.signedUrlTtlSeconds))
  }

  function loadSettings(next: StorageSettingsDto) {
    setSettings(next)
    setFeedback(null)
    setEndpoint(next.endpoint ?? '')
    setPublicEndpoint(next.publicEndpoint ?? '')
    setRegion(next.region)
    setBucket(next.bucket ?? '')
    setAccessKeyId(next.accessKeyId ?? '')
    setSecretAccessKey('')
    setSignedUrlTtlSeconds(String(next.signedUrlTtlSeconds))
  }

  const busy = save.isPending || test.isPending
  useEffect(() => { onStateChange('storage', { dirty, busy }) }, [dirty, busy, onStateChange])

  return (
    <>
      <SettingsSectionFeedback feedback={feedback} newerRevision={hasNewerAdminSettingsRevision(settings, latestSettings)} dirty={dirty} busy={busy} onReload={() => loadSettings(latestSettings)} />
      <Card className="gap-6">
        <SectionHeader
          title="Object storage"
          description="S3-compatible storage (including MinIO / OSS / COS / R2) for persisting generated image and video assets."
          status={<ConnectionBadge status={settings.status} />}
        />
        <form
          id={FORM_ID.storage}
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && dirty) save.mutate()
          }}
        >
          <fieldset disabled={busy} className="min-w-0">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="Server endpoint" hint="Must be an HTTP(S) URL without query parameters.">
                <Input
                  type="text"
                  placeholder="https://minio.internal:9000"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </FormField>
              <FormField label="Public access endpoint (optional)">
                <Input
                  type="text"
                  placeholder="https://cdn.example.com"
                  value={publicEndpoint}
                  onChange={(e) => setPublicEndpoint(e.target.value)}
                />
              </FormField>
              <FormField label="Region" hint="Only lowercase letters, digits, and hyphens; max 32 characters.">
                <Input
                  type="text"
                  maxLength={32}
                  placeholder="us-east-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </FormField>
              <FormField label="Bucket" hint="3–63 characters; only lowercase letters, digits, hyphens, and dots.">
                <Input type="text" value={bucket} onChange={(e) => setBucket(e.target.value)} />
              </FormField>
              <FormField label="Access Key ID">
                <Input
                  type="text"
                  autoComplete="off"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                />
              </FormField>
              <FormField
                label="Secret Access Key"
                hint={settings.hasSecret ? 'A secret is configured; leave empty to keep it.' : 'Secrets are write-only and are never shown again.'}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={settings.hasSecret ? '••••••••' : 'Not set'}
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                />
              </FormField>
              <FormField label="Signed URL TTL (seconds)" hint="Allowed range: 60–3600.">
                <Input
                  type="number"
                  min={60}
                  max={3600}
                  value={signedUrlTtlSeconds}
                  onChange={(e) => setSignedUrlTtlSeconds(e.target.value)}
                />
              </FormField>
            </div>
          </fieldset>
        </form>
      </Card>

      <DangerZone description="Tests the current draft by actually reading and writing a test object in the bucket; settings are saved only if the test succeeds, and not saved if it fails. After a successful save, the Secret Access Key may be overwritten and the old value cannot be retrieved.">
        <Button variant="secondary" loading={test.isPending} disabled={busy} onClick={() => { if (!busy) test.mutate() }}>
          Run connectivity test
        </Button>
      </DangerZone>

      <SaveBar formId={FORM_ID.storage} dirty={dirty} saving={save.isPending} busy={busy} onCancel={reset} />
    </>
  )
}

const runtimeFields: Array<{
  key: keyof RuntimeSettingsInput
  label: string
  min: number
  max: number
}> = [
  { key: 'uploadTtlSeconds', label: 'Upload staging TTL (seconds)', min: 300, max: 604800 },
  { key: 'signedUrlTtlSeconds', label: 'Signed URL TTL (seconds)', min: 60, max: 3600 },
  { key: 'maxImageBytes', label: 'Max single image size (bytes)', min: 1, max: 100000000 },
  { key: 'maxTotalBytes', label: 'Max total upload size per request (bytes)', min: 1, max: 200000000 },
  { key: 'maxInputs', label: 'Max reference images per generation', min: 1, max: 32 },
  { key: 'providerTimeoutMs', label: 'Upstream request timeout (milliseconds)', min: 1, max: 3600000 },
  { key: 'maxOutputBytes', label: 'Max generated result size (bytes)', min: 1, max: 100000000 },
  { key: 'jobLeaseMs', label: 'Job lease duration (milliseconds)', min: 1, max: 3600000 },
]

type RuntimeDraft = Record<keyof RuntimeSettingsInput, string>

function toRuntimeDraft(settings: RuntimeSettingsDto): RuntimeDraft {
  return {
    uploadTtlSeconds: String(settings.uploadTtlSeconds),
    signedUrlTtlSeconds: String(settings.signedUrlTtlSeconds),
    maxImageBytes: String(settings.maxImageBytes),
    maxTotalBytes: String(settings.maxTotalBytes),
    maxInputs: String(settings.maxInputs),
    providerTimeoutMs: String(settings.providerTimeoutMs),
    maxOutputBytes: String(settings.maxOutputBytes),
    jobLeaseMs: String(settings.jobLeaseMs),
  }
}

function RuntimeSection({
  settings: latestSettings,
  onStateChange,
}: {
  settings: RuntimeSettingsDto
  onStateChange: SectionStateReporter
}) {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(latestSettings)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [draft, setDraft] = useState<RuntimeDraft>(() => toRuntimeDraft(settings))

  const dirty = adminSettingsDraftChanged(toValues(), settings)

  function resolve(key: keyof RuntimeSettingsInput) {
    const raw = draft[key].trim()
    return raw === '' ? settings[key] : Number(raw)
  }

  // The same cross-check the mutation runs, surfaced on the field that caused it.
  const totalBelowImage = resolve('maxTotalBytes') < resolve('maxImageBytes')

  function toValues(): Record<keyof RuntimeSettingsInput, number> {
    // Every field is always submitted: the server only cross-checks the keys present
    // in the request, so a partial submit could store a total cap below the
    // single-image cap that stays in the row. Blank inputs fall back to the stored value.
    const values = {} as Record<keyof RuntimeSettingsInput, number>
    for (const { key } of runtimeFields) {
      values[key] = resolve(key)
    }
    return values
  }

  const save = useMutation({
    mutationFn: async () => {
      const values = toValues()
      if (values.maxTotalBytes < values.maxImageBytes) {
        throw new Error('Total size limit cannot be smaller than the single image size limit')
      }
      const res = await api<RuntimeSettingsDto>(API_ENDPOINTS.setup.runtime, { method: 'POST', body: values })
      if (!res.success) throw new Error(res.error?.message || 'Failed to save runtime limits')
      return requireAdminData(res, 'Save response is missing configuration data')
    },
    onSuccess: async (data) => {
      loadSettings(data)
      setFeedback({ ok: true, msg: 'Runtime limits saved; the Worker will apply them after its cache refreshes.' })
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey })
    },
    onError: (err: Error) => setFeedback({ ok: false, msg: err.message || 'Failed to save runtime limits' }),
  })

  function loadSettings(next: RuntimeSettingsDto) {
    setSettings(next)
    setFeedback(null)
    setDraft(toRuntimeDraft(next))
  }

  const busy = save.isPending
  useEffect(() => { onStateChange('runtime', { dirty, busy }) }, [dirty, busy, onStateChange])

  return (
    <>
      <SettingsSectionFeedback feedback={feedback} newerRevision={hasNewerAdminSettingsRevision(settings, latestSettings)} dirty={dirty} busy={busy} onReload={() => loadSettings(latestSettings)} />
      <Card className="gap-6">
        <SectionHeader
          title="Runtime limits"
          description="Guardrail parameters for uploads, generation jobs, and upstream calls; empty fields keep their current values."
          status={updatedAtStatus(settings.updatedAt)}
        />
        <form
          id={FORM_ID.runtime}
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && dirty) save.mutate()
          }}
        >
          <fieldset disabled={busy} className="min-w-0">
            <div className="grid gap-6 sm:grid-cols-2">
              {runtimeFields.map(({ key, label, min, max }) => (
                <FormField
                  key={key}
                  label={label}
                  error={
                    key === 'maxTotalBytes' && totalBelowImage ? 'Total size limit cannot be smaller than the single image size limit.' : undefined
                  }
                >
                  <Input
                    type="number"
                    min={min}
                    max={max}
                    value={draft[key]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
        </form>
      </Card>

      <SaveBar
        formId={FORM_ID.runtime}
        dirty={dirty}
        saving={save.isPending}
        busy={busy}
        onCancel={() => setDraft(toRuntimeDraft(settings))}
      />
    </>
  )
}

function SettingsSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap gap-2 md:hidden" aria-hidden="true">
        {['w-[72px]', 'w-[88px]', 'w-[64px]', 'w-[80px]'].map((width, index) => (
          <SkeletonTile key={index} className={`aspect-auto h-[var(--control-md)] rounded-control ${width}`} />
        ))}
      </div>
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <nav aria-hidden="true" className="hidden shrink-0 flex-col gap-6 md:flex md:w-settings-nav">
          {[['96px', '128px', '112px'], ['80px', '144px', '104px']].map((group, index) => (
            <div key={index} className="flex flex-col gap-2">
              <SkeletonText width="96px" />
              {group.map((width, itemIndex) => <SkeletonRow key={itemIndex} cellWidth={width} />)}
            </div>
          ))}
        </nav>
        <Card aria-hidden="true" className="flex-1 gap-6">
          <CardHeader className="gap-2">
            <SkeletonText width="200px" />
            <SkeletonText width="320px" />
          </CardHeader>
          <CardBody className="gap-6">
            <SkeletonText lines={2} />
            <div className="grid gap-6 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col gap-2">
                  <SkeletonText width={index % 2 ? '7rem' : '9rem'} />
                  <SkeletonTile className="aspect-auto h-[var(--control-md)] w-full rounded-control" />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

export function AdminSettingsView() {
  const [sectionStates, setSectionStates] = useState<Partial<Record<SectionId, SectionState>>>({})
  const [refreshConfirm, setRefreshConfirm] = useState(false)
  const reportSectionState = useCallback<SectionStateReporter>((section, state) => {
    setSectionStates((previous) => ({ ...previous, [section]: state }))
  }, [])
  const anyDirty = Object.values(sectionStates).some((state) => state?.dirty)
  const anyBusy = Object.values(sectionStates).some((state) => state?.busy)
  const [active, setActive] = useState<SectionId>('site')

  const {
    data: config,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const res = await api<SetupConfigResponse>(API_ENDPOINTS.setup.config)
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed to read system configuration')
      return res.data
    },
  })

  function requestRefresh() {
    if (anyBusy) return
    if (anyDirty) setRefreshConfirm(true)
    else void refetch()
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        className="min-w-0 [overflow-wrap:anywhere]"
        actionsClassName="max-w-full min-w-0 max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_a]:min-h-[var(--control-lg)]"
        title="System settings"
        description="Maintenance entry point for site, email, storage, and runtime parameters after instance setup."
        actions={
          <Button
            variant="secondary"
            onClick={requestRefresh}
            loading={isFetching}
            disabled={anyBusy}
            icon={<RefreshCw weight="bold" aria-hidden="true" className={iconSize.sm} />}
          >
            Refresh
          </Button>
        }
      />

      <Dialog open={refreshConfirm} onClose={() => setRefreshConfirm(false)} title="There are unsaved drafts. Refresh anyway?" size="narrow" panelClassName="max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]" footer={<>
        <Button variant="ghost" onClick={() => setRefreshConfirm(false)}>Cancel refresh</Button>
        <Button variant="secondary" disabled={anyBusy || isFetching} onClick={() => { setRefreshConfirm(false); void refetch() }}>Fetch latest server configuration</Button>
      </>}>
        <p className="text-sm">Refreshing only fetches server state and will not overwrite any section draft. If a newer version is detected, you can confirm discarding the draft and reloading in the relevant section.</p>
      </Dialog>

      {isLoading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading system settings</span>
          <SettingsSkeleton />
        </div>
      ) : null}

      {isError ? (
        <Alert
          tone="danger"
          role="alert"
          title={config ? 'System settings refresh failed' : 'Unable to load system settings'}
          action={
            <Button variant="secondary" size="sm" loading={isFetching} disabled={anyBusy} onClick={requestRefresh}>
              Refresh and retry
            </Button>
          }
        >
          {error instanceof Error ? error.message : 'Failed to read system configuration'}.{config ? 'The loaded configuration and current draft have been kept.' : 'Please try again later.'}
        </Alert>
      ) : null}

      {config ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <nav aria-label="Settings sections" className="hidden shrink-0 flex-col gap-6 md:flex md:w-settings-nav">
              {sectionGroups.map((group) => (
                <div key={group.title} className="flex flex-col gap-1">
                  <h2 className="px-3 text-overline text-muted-foreground">{group.title}</h2>
                  {group.items.map((item) => {
                    const ItemIcon = item.icon
                    const current = item.id === active
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={current ? 'true' : undefined}
                        onClick={() => setActive(item.id)}
                        className={cn(
                          'relative flex min-h-[var(--control-md)] items-center gap-3 rounded-control px-3',
                          'text-left text-sm font-medium transition-colors',
                          current
                            ? 'bg-tonal-selected text-foreground'
                            : 'text-muted-foreground hover:bg-tonal-hover hover:text-foreground',
                        )}
                      >
                        {current ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-pill bg-primary"
                          />
                        ) : null}
                        <ItemIcon weight="duotone" className={`${iconSize.sm} shrink-0`} aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </nav>

            {/* Actual Tabs panels stay mounted; the desktop rail controls the same selection.
                Hidden tab labels still name desktop panels via aria-labelledby. */}
            <Tabs
              variant="segment" value={active} onValueChange={(id) => setActive(id as SectionId)} lazy={false}
              aria-label="Settings sections" className="w-full max-w-form min-w-0 flex-1"
              listClassName="max-w-full overflow-x-auto md:hidden"
              tabs={[
                { id: 'site', label: 'Site information', content: <div className="flex flex-col gap-6"><SiteSection settings={config.site} onStateChange={reportSectionState} /></div> },
                { id: 'smtp', label: 'SMTP email service', content: <div className="flex flex-col gap-6"><SmtpSection settings={config.smtp} onStateChange={reportSectionState} /></div> },
                { id: 'storage', label: 'Object storage', content: <div className="flex flex-col gap-6"><StorageSection settings={config.storage} onStateChange={reportSectionState} /></div> },
                { id: 'runtime', label: 'Runtime limits', content: <div className="flex flex-col gap-6"><RuntimeSection settings={config.runtime} onStateChange={reportSectionState} /></div> },
              ]}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
