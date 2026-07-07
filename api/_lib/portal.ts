import type express from 'express'
import { getPool } from './db.js'
import { validateToken, type TokenRow } from './tokens.js'

/**
 * Member self-service portal helpers.
 *
 * The portal reuses the existing `member_history` token (per member, no expiry).
 * When a member presents a valid magic-link token we set a long-lived httpOnly
 * cookie holding that token value; every authenticated portal request then
 * re-validates the token server-side so a revocation takes effect immediately.
 */

export const PORTAL_COOKIE = 'portal_session'
const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60 // 180 days

/** Minimal cookie-header parser (avoids adding a cookie-parser dependency). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name) out[name] = decodeURIComponent(value)
  }
  return out
}

/** Set the session cookie holding the member_history token value. */
export function setSessionCookie(res: express.Response, tokenValue: string): void {
  const secure = process.env.NODE_ENV === 'production'
  const parts = [
    `${PORTAL_COOKIE}=${encodeURIComponent(tokenValue)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  res.append('Set-Cookie', parts.join('; '))
}

export function clearSessionCookie(res: express.Response): void {
  res.append('Set-Cookie', `${PORTAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export interface PortalMember {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  membershipNumber: string | null
}

async function loadMember(memberId: string): Promise<PortalMember | null> {
  const res = await getPool().query(
    `SELECT id, first_name, last_name, email, phone, address, membership_number
     FROM members WHERE id = $1`,
    [memberId],
  )
  const m = res.rows[0]
  if (!m) return null
  return {
    id: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    email: m.email,
    phone: m.phone,
    address: m.address,
    membershipNumber: m.membership_number,
  }
}

/**
 * Resolve the current portal member from a raw member_history token value
 * (re-validating on every call so revocation takes effect immediately).
 */
export async function resolveMemberFromToken(
  tokenValue: string | undefined,
): Promise<{ token: TokenRow; member: PortalMember } | null> {
  if (!tokenValue) return null
  const token = await validateToken(tokenValue, 'member_history')
  if (!token || !token.member_id) return null
  const member = await loadMember(token.member_id)
  if (!member) return null
  return { token, member }
}

/** Resolve the current portal member from the request's session cookie. */
export async function getPortalMember(
  req: express.Request,
): Promise<{ token: TokenRow; member: PortalMember } | null> {
  const cookies = parseCookies(req.headers.cookie)
  return resolveMemberFromToken(cookies[PORTAL_COOKIE])
}

// ── Basic in-process rate limiting for the public resend flow ──────────────────
// Keyed by IP+email. Serverless warm instances share this map; cold starts reset
// it, which is acceptable for "basic" abuse throttling per the spec.

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 3
const rateBuckets = new Map<string, number[]>()

export function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const hits = (rateBuckets.get(key) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_MAX) {
    rateBuckets.set(key, hits)
    return false
  }
  hits.push(now)
  rateBuckets.set(key, hits)
  return true
}
