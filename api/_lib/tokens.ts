import { getPool } from './db.js'

export interface TokenRow {
  id: string
  token: string
  type: string
  member_id: string | null
  judge_id: string | null
  competition_id: string | null
  expires_at: string | null
  revoked_at: string | null
}

/**
 * Upserts a submission token for a member+competition pair.
 * Returns the existing token if one exists (not revoked), otherwise creates a new one.
 * Expiry: competition closesAt + 7 days grace.
 */
export async function upsertSubmissionToken(
  memberId: string,
  competitionId: string,
  closesAt: Date | null,
): Promise<TokenRow> {
  const expiresAt = closesAt
    ? new Date(closesAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null

  const existing = await getPool().query<TokenRow>(
    `SELECT * FROM tokens
     WHERE type = 'submission' AND member_id = $1 AND competition_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [memberId, competitionId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const res = await getPool().query<TokenRow>(
    `INSERT INTO tokens (type, member_id, competition_id, expires_at)
     VALUES ('submission', $1, $2, $3)
     RETURNING *`,
    [memberId, competitionId, expiresAt],
  )
  return res.rows[0]
}

/**
 * Upserts a judging token for a judge+competition pair.
 * Expiry: judgingClosesAt + 3 days.
 */
export async function upsertJudgingToken(
  judgeId: string,
  competitionId: string,
  judgingClosesAt: Date | null,
): Promise<TokenRow> {
  const expiresAt = judgingClosesAt
    ? new Date(judgingClosesAt.getTime() + 3 * 24 * 60 * 60 * 1000)
    : null

  const existing = await getPool().query<TokenRow>(
    `SELECT * FROM tokens
     WHERE type = 'judging' AND judge_id = $1 AND competition_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [judgeId, competitionId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const res = await getPool().query<TokenRow>(
    `INSERT INTO tokens (type, judge_id, competition_id, expires_at)
     VALUES ('judging', $1, $2, $3)
     RETURNING *`,
    [judgeId, competitionId, expiresAt],
  )
  return res.rows[0]
}

/**
 * Gets or creates a permanent member_history token for a member.
 * These never expire.
 */
export async function upsertHistoryToken(memberId: string): Promise<TokenRow> {
  const existing = await getPool().query<TokenRow>(
    `SELECT * FROM tokens
     WHERE type = 'member_history' AND member_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [memberId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const res = await getPool().query<TokenRow>(
    `INSERT INTO tokens (type, member_id, expires_at)
     VALUES ('member_history', $1, NULL)
     RETURNING *`,
    [memberId],
  )
  return res.rows[0]
}

/**
 * Validates a token — returns the row if valid, null otherwise.
 */
export async function validateToken(
  tokenValue: string,
  type: 'submission' | 'judging' | 'member_history',
): Promise<TokenRow | null> {
  const res = await getPool().query<TokenRow>(
    `SELECT * FROM tokens
     WHERE token = $1 AND type = $2
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [tokenValue, type],
  )
  return res.rows[0] ?? null
}
