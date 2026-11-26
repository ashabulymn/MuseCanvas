import { NextResponse } from 'next/server'
import { db, requestProviderCredentialTest } from '../../../../../../packages/database/src/index'
import { fail, ok } from '../../../shared/http'

/**
 * POST /api/admin/provider-credentials/:id/test
 *
 * The API never probes a provider itself: it opens a test request on the
 * credential row and apps/worker (the only process that runs plugin code)
 * claims and settles it — see apps/worker/src/credentials/probe.ts. A typical
 * probe settles within the wait below, so the response usually carries the
 * outcome just as before; a slow one answers 202 `pending` and the row's
 * `lastTestStatus` turns final once the worker is done.
 */

/** A little over the worker's probe timeout plus one claim interval. */
export const CREDENTIAL_TEST_WAIT_MS = 20_000
const POLL_INTERVAL_MS = 400

const FAILURE_MESSAGES: Record<string, string> = {
  NO_API_KEY: 'No credential content configured; cannot test',
  INVALID_CREDENTIAL: 'The credential could not be decrypted or failed plugin validation. Please re-enter the credential content.',
  PROMPT_MODEL_NOT_CONFIGURED: 'Please link this credential to an enabled language model first',
  PLUGIN_NOT_LINKED: 'No media plugin is available to test this credential. Please link a model first or create a credential from a plugin template.',
  PLUGIN_NOT_REGISTERED: 'The provider plugin for this credential is not available yet. Please try again later.',
  PLUGIN_PROBE_UNSUPPORTED: 'This plugin does not support connection testing. Please verify it with a generation task.',
  PROVIDER_REJECTED: 'The credential connected to the provider but access was denied. Please check the model authorization or credential permissions.',
  PROVIDER_TEMPORARY_ERROR: 'The provider is temporarily unavailable. Please try again later.',
  PROVIDER_EMPTY_RESULT: 'The provider returned no usable result',
  PROMPT_OPTIMIZATION_REJECTED: 'The language model rejected the test request. Please check the API key and model permissions.',
  PROMPT_OPTIMIZATION_TEMPORARY_ERROR: 'The language model service is temporarily unavailable. Please try again later.',
  LANGUAGE_MODEL_RESPONSE_INVALID: 'The language model returned a result that could not be parsed',
}

/** The message shown for a settled failure code; unknown codes get a generic hint. */
export function credentialTestFailureMessage(code: string): string {
  return FAILURE_MESSAGES[code] ?? 'Credential test failed. Please check the credential content and base URL.'
}

type TestRow = { last_test_status: string | null; last_test_error_code: string | null; test_requested_at: Date | null }

/**
 * The settled outcome, or null while a request is still open. When a newer click
 * superseded this request, the row's latest outcome is the one worth showing, so
 * there is no per-request matching here: whatever settles first is returned.
 */
export function settledOutcome(row: TestRow | undefined): { status: 'success' } | { status: 'failed'; code: string } | null {
  if (!row || row.test_requested_at !== null) return null
  if (row.last_test_status === 'success') return { status: 'success' }
  if (row.last_test_status === 'failed') return { status: 'failed', code: row.last_test_error_code || 'CONNECTIVITY_FAILED' }
  return null
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function testProviderCredential(
  actor: { id: string },
  id: string,
  options: { waitMs?: number } = {},
): Promise<NextResponse> {
  const opened = await requestProviderCredentialTest(db(), id, actor.id)
  if (!opened) return fail('NOT_FOUND', 'Provider credential not found', 404)
  const deadline = Date.now() + (options.waitMs ?? CREDENTIAL_TEST_WAIT_MS)
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const r = await db().query<TestRow>(
      'SELECT last_test_status,last_test_error_code,test_requested_at FROM provider_credentials WHERE id=$1',
      [id],
    )
    const outcome = settledOutcome(r.rows[0])
    if (!outcome) continue
    return outcome.status === 'success'
      ? ok({ tested: true, status: 'success' })
      : fail(outcome.code, credentialTestFailureMessage(outcome.code))
  }
  return ok({ tested: false, status: 'pending' }, { status: 202 })
}
