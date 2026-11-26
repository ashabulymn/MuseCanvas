'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import type {
  AdminPluginScanFinding,
  AdminPluginUploadResponse,
  AdminPluginValidateSuccess,
  PluginKind,
} from '@/shared/types'
import { PLUGIN_PACKAGE_MAX_BYTES, humanFileSize, postPluginPackage, shortDigest } from '../lib/plugin-upload'
import { PluginFindingList } from './plugin-finding-list'
import { createPluginSubmissionGuard, invalidateAdminPluginCatalogs } from '../lib/admin-plugin-state'
import { ShieldWarningIcon as ShieldAlert } from '@phosphor-icons/react'
import {
  Alert,
  Button,
  Dialog,
  FileDropZone,
  Spinner,
} from '@/shared/components/ui'
import type { DropZoneFile } from '@/shared/components/ui'

/** The drop zone holds at most one package; a stable id keeps its row keyed. */
const PACKAGE_FILE_ID = 'plugin-package'

/** Mirrors PLUGIN_PACKAGE_MAX_BYTES (6 MiB) for copy; the server enforces the cap. */
const PACKAGE_MAX_LABEL = '6 MiB'

/** Debounce rapid re-selection so only the last picked package is validated. */
const VALIDATE_DEBOUNCE_MS = 400

type ValidatePhase = 'idle' | 'checking' | 'ready' | 'rejected' | 'error'

interface ValidateState {
  phase: ValidatePhase
  findings: AdminPluginScanFinding[]
  summary: AdminPluginValidateSuccess | null
  message: string
}

const IDLE: ValidateState = { phase: 'idle', findings: [], summary: null, message: '' }

interface AdminPluginUploadDialogProps {
  open: boolean
  onClose: () => void
  /** Which kernel the section belongs to; only used for the dialog title (the package's manifest.json decides the real kind). */
  kind: PluginKind
  /** Called after a successful install so the parent can announce the `待加载` handshake. */
  onInstalled?: (plugin: { pluginId: string; pluginVersion: string }) => void
}

export function AdminPluginUploadDialog({ open, onClose, kind, onInstalled }: AdminPluginUploadDialogProps) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [validate, setValidate] = useState<ValidateState>(IDLE)
  const submission = useRef(createPluginSubmissionGuard()).current

  const resetFields = () => {
    setFile(null)
    setValidate(IDLE)
  }

  const close = () => {
    // Closing is not a cancellation. Preserve this submission for reopening.
    if (!submission.isPending()) resetFields()
    onClose()
  }

  // Pre-flight: whenever a package is selected, run POST admin/plugins/validate
  // (scan-only, writes nothing) so the admin sees findings before installing. Stale responses
  // are dropped via the AbortController owned by this effect run.
  useEffect(() => {
    if (!open || submission.isPending()) return
    if (!file) {
      setValidate(IDLE)
      return
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setValidate({ ...IDLE, phase: 'error', message: 'The plugin package must be a single .zip file (also enforced by the server)' })
      return
    }
    if (file.size > PLUGIN_PACKAGE_MAX_BYTES) {
      setValidate({
        ...IDLE,
        phase: 'error',
        message: `The plugin package cannot exceed ${PLUGIN_PACKAGE_MAX_BYTES.toLocaleString('en-US')} bytes (${PACKAGE_MAX_LABEL}, enforced by the server); current size is ${humanFileSize(file.size)}`,
      })
      return
    }
    const controller = new AbortController()
    setValidate({ ...IDLE, phase: 'checking' })
    const timer = setTimeout(async () => {
      const res = await postPluginPackage<AdminPluginValidateSuccess | { ok: false; installed: false; code: string; findings: AdminPluginScanFinding[] }>(
        API_ENDPOINTS.admin.pluginValidate,
        file,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!res.success) {
        setValidate({ ...IDLE, phase: 'error', message: `${res.error?.code ?? 'ERROR'}: ${res.error?.message ?? 'Validation request failed'}` })
        return
      }
      const data = res.data
      if (data && data.ok === true) {
        setValidate({ phase: 'ready', findings: data.warnings, summary: data, message: '' })
      } else if (data) {
        // HTTP 422 arrives with a success:true envelope (server `rejected()` wraps `ok()`),
        // so findings live on res.data, not res.error.
        setValidate({ phase: 'rejected', findings: data.findings, summary: null, message: `Rejected by server: ${data.code}` })
      } else {
        setValidate({ ...IDLE, phase: 'error', message: 'Validation response is missing data' })
      }
    }, VALIDATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, file, submission])

  const installMutation = useMutation({
    mutationFn: async ({ pkg }: { pkg: File; requestId: number }) =>
      postPluginPackage<AdminPluginUploadResponse>(API_ENDPOINTS.admin.pluginUpload, pkg),
    onSuccess: async (res, { requestId }) => {
      if (!submission.owns(requestId)) return
      if (!res.success) {
        // fail() envelope: PLUGIN_UPLOAD_DISABLED / PLUGIN_VERSION_IMMUTABLE /
        // PLUGIN_ID_RESERVED / INVALID_INPUT / PLUGIN_ARTIFACT_TOO_LARGE / NETWORK_ERROR…
        submission.finish(requestId)
        setValidate({ ...IDLE, phase: 'error', message: `${res.error?.code ?? 'ERROR'}: ${res.error?.message ?? 'Upload request failed'}` })
        return
      }
      const data = res.data
      if (data && data.installed === true) {
        // The row was created with status='pending'; it goes live only after the
        // worker pulls, verifies and re-scans the artifact on its maintenance tick.
        await invalidateAdminPluginCatalogs(queryClient)
        if (!submission.finish(requestId)) return
        onInstalled?.({ pluginId: data.plugin.pluginId, pluginVersion: data.plugin.pluginVersion })
        resetFields()
        onClose()
        return
      }
      submission.finish(requestId)
      if (data) {
        setValidate({ phase: 'rejected', findings: data.findings, summary: null, message: `Rejected by server: ${data.code}` })
      } else {
        setValidate({ ...IDLE, phase: 'error', message: 'Upload response is missing data' })
      }
    },
    onError: (err: Error, { requestId }) => {
      if (!submission.finish(requestId)) return
      setValidate({ ...IDLE, phase: 'error', message: err.message || 'Upload request failed' })
    },
  })

  const blockingFindings = validate.findings.some((f) => f.severity === 'error')
  const canSubmit =
    !!file &&
    (validate.phase === 'ready' || validate.phase === 'rejected') &&
    !blockingFindings &&
    !installMutation.isPending

  // One selected package, mirrored into the shared drop zone's file row. No byte
  // progress is available from `postPluginPackage`, so no percentage is claimed:
  // the install button carries the busy state instead.
  const packageFiles: DropZoneFile[] = file
    ? [{ id: PACKAGE_FILE_ID, name: file.name, size: file.size }]
    : []

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Upload ${kind === 'media' ? 'media' : 'language'} plugin`}
      panelClassName="max-w-dialog-wide max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {installMutation.isPending ? 'Close (installation continues)' : 'Cancel'}
          </Button>
          <Button
            loading={installMutation.isPending}
            disabled={!canSubmit}
            onClick={() => {
              if (!file || !canSubmit) return
              const requestId = submission.begin()
              if (requestId !== null) installMutation.mutate({ pkg: file, requestId })
            }}
          >
            Install plugin
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {installMutation.isPending && (
          <Alert tone="info" role="status" title="Installing plugin">
            Submitting {file?.name}. Closing this window will not cancel or roll back the installation; reopening shows the same submission, and the plugin package cannot be replaced, removed, or resubmitted until it completes.
          </Alert>
        )}
        {/* Risk disclosure — deliberately first-class content, not fine print. */}
        <Alert
          tone="danger"
          icon={<ShieldAlert weight="fill" aria-hidden="true" />}
          title="Read before uploading"
        >
          <div className="flex flex-col gap-2">
            <p>
              Uploaded plugin code will be executed by the Worker process<strong>with the full permissions of that process</strong>(it can read and write job data and access configured provider credentials and the network).
              Only trusted administrators may upload; never load a plugin package from an unknown source.
            </p>
            <p>
              <strong>The same version cannot be overwritten; bump the version number and re-upload</strong>: the plugin uses <code className="font-mono">pluginId@pluginVersion</code>{' '}
               as a write-once identity (taken from the package's <code className="font-mono">manifest.json</code> id / version); the Worker registry and module cache both key on that identity, so hot-replacing the same version has no effect and the server rejects it directly (PLUGIN_VERSION_IMMUTABLE).
            </p>
          </div>
        </Alert>

        <FileDropZone
          files={packageFiles}
          disabled={installMutation.isPending}
          onFilesSelected={(files) => {
            if (submission.isPending()) return
            setValidate(IDLE)
            setFile(files[0] ?? null)
          }}
          onRemove={installMutation.isPending ? undefined : () => {
            if (submission.isPending()) return
            setValidate(IDLE)
            setFile(null)
          }}
          accept=".zip,application/zip"
          maxFileSize={PLUGIN_PACKAGE_MAX_BYTES}
          maxFiles={1}
          label="Drag a .zip plugin package here, or click to select a file"
          hint={`A single .zip file, max size ${PACKAGE_MAX_LABEL} (${PLUGIN_PACKAGE_MAX_BYTES.toLocaleString('en-US')} bytes), as enforced by the server.`}
        />

        <div className="flex flex-col gap-1 rounded-control bg-tonal p-3 text-xs text-muted-foreground">
          <p>
            The plugin package must contain <code className="font-mono text-foreground">manifest.json</code> and the single {' '}
            <code className="font-mono text-foreground">package.entry</code> it points to<code className="font-mono text-foreground">.mjs</code>{' '}
             entry; optionally also include <code className="font-mono text-foreground">README.md</code>, <code className="font-mono text-foreground">CHANGELOG.md</code>, 
            <code className="font-mono text-foreground">LICENSE</code> and PNG / WebP icons.
          </p>
          <p>The manifest is read only from the package's manifest.json; no extra fields need to be filled in, and field rules are validated by the server.</p>
        </div>

        {/* aria-live region: pre-flight verdict + findings update without a click. */}
        <div aria-live="polite" role="status" className="flex flex-col gap-2">
          {validate.phase === 'checking' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner label="Validating" />
              Unpacking and scanning the plugin package on the server (not stored)…
            </p>
          )}
          {validate.phase === 'error' && (
            <Alert tone="danger" role="alert" title="Pre-check could not be completed">
              {validate.message}. Please replace the plugin package file or fix the manifest.json inside the package, then retry.
            </Alert>
          )}
          {validate.phase === 'rejected' && (
            <div className="flex flex-col gap-2">
              <Alert tone="danger" role="alert" title="The server rejected this plugin package">
                {validate.message}. Fix the findings below (grouped by file in the package) and re-upload with a new version number.
              </Alert>
              <PluginFindingList findings={validate.findings} groupByPath />
            </div>
          )}
          {validate.phase === 'ready' && validate.summary && (
            <div className="flex flex-col gap-2">
              <Alert tone="success" title="Validation passed">
                The plugin package passed the server scan and can be installed.
              </Alert>
              <div className="flex flex-col gap-1 rounded-control bg-tonal p-3 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">
                  {validate.summary.pluginId}@{validate.summary.pluginVersion}
                </span>
                <span>
                  {validate.summary.displayName} · {validate.summary.modelIds.length} models · entry artifact sha256{' '}
                  <span className="font-mono text-foreground" title={validate.summary.artifactDigest}>
                    {shortDigest(validate.summary.artifactDigest)}
                  </span>{' '}
                  · {humanFileSize(validate.summary.artifactSizeBytes)}
                </span>
              </div>
              {validate.summary.warnings.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">Warnings (do not block installation, but please confirm they are expected):</p>
                  <PluginFindingList findings={validate.summary.warnings} groupByPath />
                </div>
              )}
            </div>
          )}
          {validate.phase === 'idle' && (
            <p className="text-xs text-muted-foreground">A server pre-check runs automatically after you select a .zip plugin package.</p>
          )}
        </div>

        {blockingFindings && (
          <Alert tone="danger" role="alert" title="Unable to install plugin">
            Error-level scan findings exist, so installation is blocked. Fix the plugin package based on the findings below and re-upload.
          </Alert>
        )}

        <p className="text-xs text-muted-foreground">
          After a successful installation the plugin status is "Pending": the Worker must fetch the artifact, verify sha256, and pass a rescan before it is enabled; installation completing does not mean it takes effect immediately.
        </p>
      </div>
    </Dialog>
  )
}
