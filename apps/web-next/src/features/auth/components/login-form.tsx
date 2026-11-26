'use client'

import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { API_ENDPOINTS } from '@musecanvas/contracts'
import { ArrowLeftIcon as ArrowLeft, EnvelopeSimpleIcon as Mail } from '@phosphor-icons/react'
import { api } from '@/shared/services/api'
import { useAuthUiStore } from '@/shared/stores/auth-ui-store'
import type { User } from '@/shared/types'
import { safeRedirectPath } from '@/shared/lib/app-routes'
import {
  Button,
  FieldGroup,
  FormField,
  IconButton,
  Input,
  buttonVariants,
} from '@/shared/components/ui'
import { GithubIcon, GoogleIcon } from '@/shared/components/brand-icons'

type Step = 'email' | 'invitation' | 'otp'
/** Every step owns exactly one field, so a failed request has a home to report in. */
type FieldKey = 'email' | 'invitation' | 'otp'
type FieldErrors = Partial<Record<FieldKey, string>>

const fieldOfStep: Record<Step, FieldKey> = {
  email: 'email',
  invitation: 'invitation',
  otp: 'otp',
}

/** Shape check only — the backend stays the authority on whether an address exists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** copy.md §4: 发生了什么 + 为什么 + 如何解决. */
const NETWORK_ERROR = 'Network connection failed. Your device may be offline or the backend service may be temporarily unavailable. Check your connection and try again.'
const OTP_SEND_FAILED = 'Failed to send the verification code. Confirm the email address is correct, then resend it later.'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = safeRedirectPath(searchParams.get('from'))

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Focus lands on the first invalid field after a submit (components.md → Inline
  // error), never while the user is still typing.
  const inputRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({})
  const focusFirstError = useCallback((next: FieldErrors) => {
    const first = (Object.keys(fieldOfStep) as FieldKey[]).find((key) => Boolean(next[key]))
    if (first) inputRefs.current[first]?.focus()
  }, [])

  const setUser = useAuthUiStore((s) => s.setUser)

  /** Typing clears only the field's own error, so a hint never fights another. */
  function clearFieldError(key: FieldKey) {
    setErrors((previous) => {
      if (!previous[key]) return previous
      const next: FieldErrors = { ...previous }
      delete next[key]
      return next
    })
  }

  function reportFailure(message: string) {
    const next: FieldErrors = {}
    next[fieldOfStep[step]] = message
    setErrors(next)
    focusFirstError(next)
  }

  async function handleSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedEmail = email.trim()
    const next: FieldErrors = {}
    if (!trimmedEmail) {
      next.email = 'Email address is required. Enter the email address that receives the login verification code.'
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      next.email = 'Email address format is incorrect. Confirm it contains @ and a full domain, e.g. name@example.com.'
    }
    if (step === 'invitation' && !invitationCode.trim()) {
      next.invitation = 'Invitation code is required. Enter the code you received — each code can usually be used only once.'
    }

    setErrors(next)
    if (next.email || next.invitation) {
      focusFirstError(next)
      return
    }

    setLoading(true)

    try {
      const res = await api<{ accepted: boolean; nextStep: 'invitation' | 'otp' }>(
        API_ENDPOINTS.auth.otpRequest,
        {
          method: 'POST',
          body: { email: trimmedEmail, invitationCode: invitationCode.trim() || undefined },
        },
      )
      setLoading(false)

      if (res.success && res.data) {
        setStep(res.data.nextStep)
        return
      }
      reportFailure(res.error?.message || OTP_SEND_FAILED)
    } catch {
      setLoading(false)
      reportFailure(NETWORK_ERROR)
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!otpCode.trim()) {
      const next: FieldErrors = { otp: 'Verification code is required. Enter the 6-digit code from the email.' }
      setErrors(next)
      focusFirstError(next)
      return
    }

    setLoading(true)

    try {
      const res = await api<{ user: User }>(API_ENDPOINTS.auth.otpVerify, {
        method: 'POST',
        body: {
          email: email.trim(),
          code: otpCode.trim(),
          invitationCode: invitationCode.trim() || undefined,
        },
      })
      setLoading(false)

      if (res.success && res.data?.user) {
        setUser(res.data.user)
        router.push(from)
        router.refresh()
        return
      }
      reportFailure(
        res.error?.message || 'The verification code is wrong or expired. Enter the code from the latest email, or go back a step and resend it.',
      )
    } catch {
      setLoading(false)
      reportFailure(NETWORK_ERROR)
    }
  }

  /** Returns to the email step; the typed values stay in state (失败保留输入). */
  function backToEmail() {
    setErrors({})
    setStep('email')
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-title text-foreground">
          {step === 'otp' ? 'Enter verification code' : step === 'invitation' ? 'Invitation code required' : 'Log in to\u00A0MuseCanvas'}
        </h1>
        <p
          className={`min-w-0 text-sm text-muted-foreground [text-wrap:pretty] ${
            step === 'otp' ? '[overflow-wrap:anywhere]' : ''
          }`}
        >
          {step === 'otp'
            ? `Verification code sent to ${email}. Enter the 6-digit code from the email below.`
            : step === 'invitation'
              ? 'The platform is currently in an invitation-only testing period. Enter a valid invitation code.'
              : 'No complex password needed — log in with an email verification code.'}
        </p>
      </header>

      {step === 'email' && (
        <form noValidate onSubmit={handleSendOtp} className="flex flex-col gap-6">
          <FieldGroup>
            <FormField
              id="email"
              label="Email address"
              required
              hint="Your email is only used for login and recovering your works."
              error={errors.email}
            >
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clearFieldError('email')
                }}
                placeholder="name@example.com"
                ref={(node) => {
                  inputRefs.current.email = node
                }}
              />
            </FormField>
          </FieldGroup>

          <Button
            type="submit"
            loading={loading}
            fullWidth
            icon={<Mail weight="bold" aria-hidden="true" />}
          >
            Get login code
          </Button>
        </form>
      )}

      {step === 'invitation' && (
        <form noValidate onSubmit={handleSendOtp} className="flex flex-col gap-6">
          <FieldGroup>
            <FormField
              id="invite"
              label="Invitation code"
              required
              hint="The invitation code is provided by the issuer and may only be usable once."
              error={errors.invitation}
            >
              <Input
                type="text"
                autoComplete="off"
                value={invitationCode}
                onChange={(event) => {
                  setInvitationCode(event.target.value)
                  clearFieldError('invitation')
                }}
                placeholder="Enter your invitation code"
                ref={(node) => {
                  inputRefs.current.invitation = node
                }}
              />
            </FormField>
          </FieldGroup>

          <div className="flex items-center gap-3">
            <IconButton
              variant="secondary"
              aria-label="Go back a step to check the email address"
              onClick={backToEmail}
              icon={<ArrowLeft weight="bold" aria-hidden="true" />}
            />
            <Button type="submit" loading={loading} className="flex-1">
              Confirm and send code
            </Button>
          </div>
        </form>
      )}

      {step === 'otp' && (
        <form noValidate onSubmit={handleVerifyOtp} className="flex flex-col gap-6">
          <FieldGroup>
            <FormField
              id="otp"
              label={`6\u00A0digit code`}
              required
              hint={`Sent to ${email}`}
              error={errors.otp}
            >
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                value={otpCode}
                onChange={(event) => {
                  setOtpCode(event.target.value)
                  clearFieldError('otp')
                }}
                placeholder="123456"
                className="text-center font-mono tracking-widest"
                ref={(node) => {
                  inputRefs.current.otp = node
                }}
              />
            </FormField>
          </FieldGroup>

          <div className="flex items-center gap-3">
            <IconButton
              variant="secondary"
              aria-label="Go back a step to re-enter the email address"
              onClick={backToEmail}
              icon={<ArrowLeft weight="bold" aria-hidden="true" />}
            />
            <Button type="submit" loading={loading} className="flex-1">
              Verify and log in
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-center text-sm text-muted-foreground">Or log in with a third-party account</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={API_ENDPOINTS.auth.oauthStart('github')}
            className={buttonVariants({ variant: 'secondary', className: 'flex-1 gap-2' })}
          >
            <GithubIcon className="h-5 w-5 shrink-0" />
            <span>Log in with GitHub</span>
          </a>
          <a
            href={API_ENDPOINTS.auth.oauthStart('google')}
            className={buttonVariants({ variant: 'secondary', className: 'flex-1 gap-2' })}
          >
            <GoogleIcon className="h-5 w-5 shrink-0" />
            <span>Log in with Google</span>
          </a>
        </div>
      </div>
    </div>
  )
}
