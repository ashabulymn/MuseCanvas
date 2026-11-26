'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { api } from '@/shared/services/api'
import type { BuiltinProviderTemplate, ProviderCredentialInput } from '@/shared/types'
import {
  CUSTOM_PROVIDER_OPTIONS,
  buildTemplateCredentialInput,
  parseJsonSecret,
  parseServiceAccountJson,
} from '../lib/provider-templates'
import {
  Alert,
  Button,
  Dialog,
  FieldGroup,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/shared/components/ui'

interface AdminProviderCredentialDialogProps {
  open: boolean
  onClose: () => void
  templates?: BuiltinProviderTemplate[]
  /** When set, the dialog is pinned to this plugin and hides both pickers. */
  lockedTemplate?: BuiltinProviderTemplate | null
  /**
   * Which credential family the dialog creates. `media` offers template-validated
   * credentials (plus custom media provider accounts); `language` is the
   * provider + API key shape that language models bind to.
   */
  scope?: 'media' | 'language'
}

type Mode = 'template' | 'legacy'

/** Fields whose local validation failed; each message renders inside its `FormField`. */
type FieldKey = 'template' | 'displayName' | 'apiKey' | 'serviceAccount'
type FieldErrors = Partial<Record<FieldKey, string>>

/** A validation failure that belongs to one input, not to the dialog as a whole. */
interface FieldValidationError extends Error {
  field: FieldKey
}

function validationError(field: FieldKey, message: string): FieldValidationError {
  return Object.assign(new Error(message) as FieldValidationError, { field })
}

const MODE_OPTIONS: { value: Mode; label: string; hint: string }[] = [
  { value: 'template', label: 'Built-in plugin', hint: 'Validated against the plugin-declared format and endpoints; connectivity can be tested.' },
  { value: 'legacy', label: 'Custom credential', hint: 'Selects only a provider account; a compatible endpoint can be entered.' },
]

// Credentials belong to a provider account. A template names the plugin whose
// declared contract validates the secret; custom credentials name only the account
// (language models and compatible endpoints), and the API checks them against
// every plugin of that account.
const ENDPOINT_POLICY_LABEL: Record<BuiltinProviderTemplate['credential']['baseUrlPolicy'], string> = {
  fixed: 'Official endpoints only',
  allowlisted: 'Plugin-allowed domains',
  'any-https': 'Any HTTPS endpoint',
}

export function AdminProviderCredentialDialog({
  open,
  onClose,
  templates = [],
  lockedTemplate,
  scope = 'media',
}: AdminProviderCredentialDialogProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>(scope === 'language' ? 'legacy' : 'template')
  const [templateKey, setTemplateKey] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [serviceAccountRaw, setServiceAccountRaw] = useState('')
  const [customProvider, setCustomProvider] = useState(CUSTOM_PROVIDER_OPTIONS[scope][0].value)
  const [baseUrl, setBaseUrl] = useState('')
  const [actionError, setActionError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const customProviders = CUSTOM_PROVIDER_OPTIONS[scope]
  const template = scope === 'language'
    ? null
    : lockedTemplate ?? templates.find((t) => t.key === templateKey) ?? null
  const effectiveMode: Mode = scope === 'language' ? 'legacy' : (lockedTemplate ? 'template' : mode)
  const useJsonSecret = template?.credential.format === 'json'

  function clearFieldError(field: FieldKey) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  const resetFields = () => {
    setDisplayName('')
    setApiKey('')
    setServiceAccountRaw('')
    setBaseUrl('')
    setActionError('')
    setFieldErrors({})
  }

  // Clear both secret formats on every identity change, including locked templates.
  // Conservatively clearing compatible templates too avoids accidental account reuse.
  useEffect(() => {
    setApiKey('')
    setServiceAccountRaw('')
    setFieldErrors({})
    setActionError('')
  }, [open, scope, effectiveMode, template?.key, template?.providerId, template?.credential.format, template?.credential.schemaId, template?.credential.schemaVersion, customProvider])

  function close() {
    resetFields()
    onClose()
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      setFieldErrors({})
      setActionError('')
      let body: ProviderCredentialInput
      if (effectiveMode === 'template') {
        if (!template) throw validationError('template', 'Please select a media plugin.')
        if (template.credential.format === 'json') {
          // Google's service-account fields are known here; any other JSON
          // credential is checked by its plugin's declared contract on save.
          const parsed = template.providerId === 'google'
            ? parseServiceAccountJson(serviceAccountRaw)
            : parseJsonSecret(serviceAccountRaw)
          if (!parsed.ok) throw validationError('serviceAccount', parsed.error)
          body = buildTemplateCredentialInput(template, parsed.value, displayName)
        } else {
          if (!apiKey.trim()) throw validationError('apiKey', 'Please enter an API Key.')
          body = buildTemplateCredentialInput(template, apiKey.trim(), displayName)
        }
      } else {
        if (!displayName.trim()) throw validationError('displayName', 'Please enter a credential display name.')
        if (!apiKey.trim()) throw validationError('apiKey', 'Please enter an API Key.')
        body = { displayName: displayName.trim(), providerId: customProvider, baseUrl: baseUrl.trim() || undefined, secret: apiKey.trim(), enabled: true }
      }
      const res = await api(API_ENDPOINTS.admin.providerCredentials, { method: 'POST', body })
      if (!res.success) throw new Error(res.error?.message || 'Failed to create credential')
      return res.data
    },
    onSuccess: () => {
      close()
      queryClient.invalidateQueries({ queryKey: ['admin', 'provider-credentials'] })
    },
    onError: (err: Error) => {
      const fieldError = err as Partial<FieldValidationError>
      if (fieldError.field) {
        // Inline only: the field says what is missing, so no dialog-level banner.
        const field = fieldError.field
        setFieldErrors((prev) => ({ ...prev, [field]: err.message }))
        setActionError('')
        return
      }
      setActionError(err.message || 'Failed to create credential')
    },
  })

  const credentialFieldLabel = useJsonSecret
    ? template?.credential.label
    : (template?.credential.label ?? 'API Key')

  return (
    <Dialog
      open={open}
      onClose={close}
      title={
        effectiveMode === 'template'
          ? 'Create credential from a media plugin'
          : scope === 'language'
            ? 'Create language model credential'
            : 'Create custom credential'
      }
      panelClassName="max-w-form max-h-[90dvh] max-md:[&_button]:min-h-[var(--control-lg)] max-md:[&_button]:min-w-[var(--control-lg)]"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            loading={createMutation.isPending}
            disabled={createMutation.isPending || (effectiveMode === 'template' && !template)}
            onClick={() => createMutation.mutate()}
          >
            Save credential
          </Button>
        </>
      }
    >
      <fieldset disabled={createMutation.isPending} className="flex min-w-0 flex-col gap-6">
        {actionError && (
          <Alert tone="danger" role="alert" title="Unable to create credential">
            {actionError}. Check the entered values and provider configuration, then retry; if the secret is invalid, obtain a new API Key.
          </Alert>
        )}

        {scope === 'media' && !lockedTemplate && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Credential type</legend>
            {/* Native radios + `accent-color`: keyboard, form semantics and the
                selected state come from the platform, not from aria-pressed. */}
            <div className="flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-[var(--control-md)] flex-1 cursor-pointer items-start gap-2 rounded-control px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-tonal-hover"
                >
                  <input
                    type="radio"
                    name="credential-mode"
                    value={option.value}
                    checked={effectiveMode === option.value}
                    onChange={() => {
                      setMode(option.value)
                      setActionError('')
                    }}
                    className="mt-1 h-5 w-5 shrink-0 accent-primary"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <FieldGroup>
          {effectiveMode === 'template' && !lockedTemplate && (
            <FormField
              label="Media plugin"
              required
              error={fieldErrors.template}
              hint="Credentials are validated against the selected plugin's declared format and endpoints; other plugins under the same provider account can also use them."
            >
              <Select
                value={templateKey}
                onChange={(e) => {
                  setTemplateKey(e.target.value)
                  clearFieldError('template')
                }}
              >
                <option value="">Please select a plugin</option>
                {templates.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.displayName} · {t.pluginId}@{t.pluginVersion} · {t.modality === 'video' ? 'Video' : 'Image'}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {effectiveMode === 'template' && template && (
            <div className="flex flex-col gap-1 rounded-control bg-tonal p-3 text-xs text-muted-foreground">
              <div className="font-mono text-foreground">
                {template.pluginId}@{template.pluginVersion}
              </div>
              <div>
                Provider {template.providerId} · Credential {template.credential.schemaId}@{template.credential.schemaVersion}
              </div>
              <div className="break-all font-mono">{template.baseUrl}</div>
              <div>Endpoint policy: {ENDPOINT_POLICY_LABEL[template.credential.baseUrlPolicy]}</div>
            </div>
          )}

          {effectiveMode === 'legacy' && (
            <div className="rounded-control bg-tonal p-3 text-xs text-muted-foreground">
              {scope === 'language' ? (
                <>
                  Language model credentials consist of{' '}
                  <span className="font-mono text-foreground">Provider + API Key</span>  and a compatible endpoint can be entered.
                </>
              ) : (
                <>
                  Custom credentials are not validated against a plugin template; once linked to a model, they can be connectivity-tested using that model's plugin. These credentials are listed on the
                  <span className="font-mono text-foreground">Language model</span>
                   page's credential list.
                </>
              )}
            </div>
          )}

          {effectiveMode === 'legacy' && (
            <FormField
              label="Display name"
              required
              error={fieldErrors.displayName}
              hint="Identifies this credential in model configurations, e.g. by provider or purpose."
            >
              <Input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  clearFieldError('displayName')
                }}
                placeholder={scope === 'language' ? 'Example: Anthropic language model credential' : 'Example: self-hosted OpenAI-compatible endpoint'}
                autoComplete="off"
              />
            </FormField>
          )}

          {effectiveMode === 'legacy' && (
            <FormField label="Provider" hint="The provider account this credential belongs to; it determines which plugins' models can use it.">
              <Select value={customProvider} onChange={(e) => setCustomProvider(e.target.value)}>
                {customProviders.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {effectiveMode === 'legacy' && (
            <FormField
              label="Base URL (optional)"
              hint="Leave empty to use the provider's default endpoint; when filling it in, include the version path, e.g. https://api.example.com/v1."
            >
              <Input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
          )}

          {effectiveMode === 'template' && (
            <FormField
              label="Display name (optional)"
              hint="Leave empty to use the plugin name as the credential display name."
            >
              <Input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  clearFieldError('displayName')
                }}
                placeholder={template ? template.displayName : 'Defaults to the plugin name'}
                autoComplete="off"
              />
            </FormField>
          )}

          {effectiveMode === 'legacy' ? (
            <FormField
              label="API Key"
              required
              error={fieldErrors.apiKey}
              hint="Secrets are stored encrypted on the server and are never shown in plaintext after saving."
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  clearFieldError('apiKey')
                }}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
          ) : useJsonSecret ? (
            <FormField
              label={credentialFieldLabel ?? 'Credential JSON'}
              required
              error={fieldErrors.serviceAccount}
              hint={template?.credential.helpText ?? 'Paste the credential JSON; only the server decrypts it.'}
              keepHintOnError
            >
              <Textarea
                value={serviceAccountRaw}
                onChange={(e) => {
                  setServiceAccountRaw(e.target.value)
                  clearFieldError('serviceAccount')
                }}
                rows={6}
                placeholder={template?.credential.placeholder}
                spellCheck={false}
                className="font-mono text-xs"
              />
            </FormField>
          ) : (
            <FormField
              label={credentialFieldLabel ?? 'API Key'}
              required
              error={fieldErrors.apiKey}
              hint={template?.credential.helpText ?? 'Secrets are stored encrypted on the server and are never shown in plaintext after saving.'}
              keepHintOnError
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  clearFieldError('apiKey')
                }}
                placeholder={template?.credential.placeholder ?? 'sk-...'}
                autoComplete="new-password"
                spellCheck={false}
              />
            </FormField>
          )}
        </FieldGroup>
      </fieldset>
    </Dialog>
  )
}
