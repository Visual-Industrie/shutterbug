import { z } from 'zod'

/**
 * The personal details a member (or applicant) owns: the single source for the
 * field list used by /join, the admin Applicants and Members pages, and the
 * member portal. Keys are the database column names on both `applicants` and
 * `members`.
 *
 * Admin-only fields (membership number, status, type, subs, joined date, notes)
 * are deliberately absent — zod strips unknown keys, so parsing a portal request
 * with this schema drops them even if a crafted request sends them.
 */

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type ExperienceLevel = typeof EXPERIENCE_LEVELS[number]

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/** Choices for the /join "How did you hear about us" question. */
export const HEAR_ABOUT_US_OPTIONS = [
  'Word of mouth', 'Facebook', 'Website', 'Newspaper / magazine', 'Poster / flyer', 'Other',
]

/** Trim; blank becomes null. */
const optionalText = z.preprocess(
  v => (typeof v === 'string' ? v.trim() || null : v ?? null),
  z.string().max(2000).nullable(),
)

const requiredText = (label: string) =>
  z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`)

const optionalDate = z.preprocess(
  v => (typeof v === 'string' ? v.trim() || null : v ?? null),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD').nullable(),
)

export const memberProfileSchema = z.object({
  first_name: requiredText('First name'),
  last_name: requiredText('Last name'),
  email: z.string({ required_error: 'Email is required' })
    .trim().toLowerCase().min(1, 'Email is required').email('Enter a valid email address'),
  phone: optionalText,
  landline: optionalText,
  address: optionalText,
  experience_level: z.preprocess(
    v => (v === '' || v === undefined ? null : v),
    z.enum(EXPERIENCE_LEVELS, { errorMap: () => ({ message: 'Choose an experience level' }) }).nullable(),
  ),
  photographic_interests: optionalText,
  software: optionalText,
  privacy_act_ok: z.boolean({ required_error: 'Privacy consent is required' }),
  image_use_ok: z.boolean({ required_error: 'Image use consent is required' }),
})

export type MemberProfileFields = z.infer<typeof memberProfileSchema>

export const MEMBER_PROFILE_KEYS = Object.keys(memberProfileSchema.shape) as (keyof MemberProfileFields)[]

/** The /join payload: the profile plus application-only fields. */
export const applicationSchema = memberProfileSchema.extend({
  privacy_act_ok: z.literal(true, { errorMap: () => ({ message: 'Privacy Act consent is required' }) }),
  image_use_ok: z.literal(true, { errorMap: () => ({ message: 'Image use consent is required' }) }),
  hear_about_us: optionalText,
  known_members: z.boolean().default(false),
  payment_method: optionalText,
  pay_by_date: optionalDate,
})

export type ApplicationFields = z.infer<typeof applicationSchema>

/** First validation message, for a 400 response body. */
export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Invalid request'
}

// ── Form helpers (frontend) ──────────────────────────────────────────────────

/** Controlled-form shape: text fields as strings ('' for empty), consents as booleans. */
export type MemberProfileFormValues = {
  [K in keyof MemberProfileFields]: MemberProfileFields[K] extends boolean ? boolean : string
}

export const EMPTY_PROFILE_FORM: MemberProfileFormValues = {
  first_name: '', last_name: '', email: '', phone: '', landline: '', address: '',
  experience_level: '', photographic_interests: '', software: '',
  privacy_act_ok: false, image_use_ok: false,
}

/** Build form values from an API row (snake_case, nulls allowed). */
export function toProfileForm(row: Partial<Record<keyof MemberProfileFields, unknown>>): MemberProfileFormValues {
  const out = { ...EMPTY_PROFILE_FORM } as Record<string, string | boolean>
  for (const k of MEMBER_PROFILE_KEYS) {
    const v = row[k]
    out[k] = typeof EMPTY_PROFILE_FORM[k] === 'boolean' ? !!v : String(v ?? '')
  }
  return out as MemberProfileFormValues
}
