import { MEMBER_PROFILE_KEYS, type MemberProfileFields } from '../../src/shared/memberProfile.js'

/**
 * SQL helpers for writing the shared member-profile fields (see
 * src/shared/memberProfile.ts) to `applicants` or `members` — both tables use
 * the same column names. Params always start at $1 in profileParams() order,
 * so a handler's own params follow from $${PROFILE_PARAM_COUNT + 1}.
 */

export const PROFILE_PARAM_COUNT = MEMBER_PROFILE_KEYS.length

const param = (k: keyof MemberProfileFields) => `$${MEMBER_PROFILE_KEYS.indexOf(k) + 1}`

/** "$from, $from+1, …" — placeholders for a handler's own params. */
export function placeholders(from: number, count: number): string {
  return Array.from({ length: count }, (_, i) => `$${from + i}`).join(', ')
}

/** Columns and VALUES for a new row; a consent given now is stamped now. */
export const PROFILE_INSERT = {
  columns: [...MEMBER_PROFILE_KEYS, 'privacy_act_consented_at', 'image_use_consented_at'].join(', '),
  values: [
    ...MEMBER_PROFILE_KEYS.map(param),
    `CASE WHEN ${param('privacy_act_ok')}::boolean THEN NOW() END`,
    `CASE WHEN ${param('image_use_ok')}::boolean THEN NOW() END`,
  ].join(', '),
}

// Stamp a consent the moment it's given; clear it when withdrawn. In an UPDATE
// every right-hand side sees the old row, so `<col>_ok` here is the prior value.
function consentStamp(col: 'privacy_act' | 'image_use'): string {
  return `${col}_consented_at = CASE WHEN NOT ${param(`${col}_ok`)}::boolean THEN NULL
    WHEN ${col}_ok THEN ${col}_consented_at ELSE NOW() END`
}

/** `SET` assignments for every profile column. */
export const PROFILE_SET = [
  ...MEMBER_PROFILE_KEYS.map(k => `${k} = ${param(k)}`),
  consentStamp('privacy_act'),
  consentStamp('image_use'),
].join(', ')

/** Param values for PROFILE_INSERT / PROFILE_SET, in order. */
export function profileParams(p: MemberProfileFields): unknown[] {
  return MEMBER_PROFILE_KEYS.map(k => p[k])
}

/** Postgres unique violation — for us, almost always members.email. */
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505'
}

export const EMAIL_IN_USE = 'That email address is already in use by another member'
