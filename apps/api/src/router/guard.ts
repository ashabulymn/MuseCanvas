import { NextResponse, type NextRequest } from 'next/server'
import { actorFrom, type Actor } from '../auth/security'
import { fail } from '../shared/http'

/**
 * The single session gate. Extracted verbatim from the catch-all handler, so the
 * status codes, error codes and Chinese message strings stay exactly where they
 * were; every route table entry resolves through here.
 */
export async function requireActor(request: NextRequest, admin = false): Promise<Actor | NextResponse> {
  const actor = await actorFrom(request)
  if (!actor) return fail('UNAUTHORIZED', 'Please log in first', 401)
  if (admin && actor.role !== 'admin') return fail('FORBIDDEN', 'You do not have permission to perform this action', 403)
  return actor
}

export function requireAdmin(request: NextRequest): Promise<Actor | NextResponse> {
  return requireActor(request, true)
}

/** Narrow the `Actor | NextResponse` union: a response means "already answered". */
export function isResponse(value: Actor | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}
