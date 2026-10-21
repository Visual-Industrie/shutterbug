// Shared between api/_lib/judge-availability.ts and the React pages.

export type JudgeAvailabilityResponse = 'keen' | 'not_this_year' | 'remove'

export interface AvailabilityCompetition {
  id: string
  name: string
  /** HTML (TipTap), authored by admins. */
  description: string | null
  eventType: string
  /** Entries close (ISO). Null for award/other events. */
  closesAt: string | null
  /** Judging / club night (ISO). */
  judgingClosesAt: string | null
  /** True once a judge has been assigned — no longer selectable. */
  filled: boolean
}

export interface AvailabilityPageData {
  judge: { firstName: string; name: string; isAvailable: boolean; archived: boolean }
  season: { id: string; year: number }
  /** Token expiry (ISO) — the response deadline. */
  deadline: string | null
  readOnly: boolean
  competitions: AvailabilityCompetition[]
  current: {
    response: JudgeAvailabilityResponse | null
    /** Competition ids in rank order (index 0 = first choice). */
    preferences: string[]
    respondedAt: string | null
  }
}

export interface AvailabilitySubmitBody {
  response: JudgeAvailabilityResponse
  /** Competition ids, index 0 = rank 1. Must be empty unless response is 'keen'. */
  preferences: string[]
}

// ── Admin overview ──────────────────────────────────────────────────────────

export interface AvailabilityOverviewCompetition extends AvailabilityCompetition {
  assignedJudges: Array<{ id: string; name: string }>
}

export interface AvailabilityOverviewJudge {
  id: string
  name: string
  email: string
  isAvailable: boolean
  archivedAt: string | null
  token: string | null
  response: JudgeAvailabilityResponse | null
  respondedAt: string | null
  /** Competition ids in rank order. */
  preferences: string[]
}

export interface AvailabilityOverview {
  season: { id: string; year: number }
  /** When the first invite for this season went out (earliest token). Null if never sent. */
  sentAt: string | null
  deadline: string | null
  /** Competitions with no judge — what the email lists. */
  eligibleCount: number
  competitions: AvailabilityOverviewCompetition[]
  judges: AvailabilityOverviewJudge[]
}
