import { getPool } from './db.js'
import { validateToken } from './tokens.js'

export interface JudgingEntry {
  id: string
  type: string
  title: string
  memberNumber: string | null  // anonymised — never name
  driveFileId: string | null
  driveFileUrl: string | null
  driveThumbnailUrl: string | null
  award: string | null
  judgeComment: string | null
  judgedAt: string | null
}

export interface JudgingPageData {
  competition: {
    id: string
    name: string
    status: string
    judgingClosesAt: string | null
    pointsHonours: number
    pointsHighlyCommended: number
    pointsCommended: number
    pointsAccepted: number
  }
  judge: { id: string; name: string }
  entries: JudgingEntry[]
  scoredCount: number
}

export async function getJudgingData(tokenValue: string): Promise<JudgingPageData | null> {
  const tok = await validateToken(tokenValue, 'judging')
  if (!tok) return null

  const pool = getPool()

  const compRes = await pool.query(
    `SELECT id, name, status, judging_closes_at,
            points_honours, points_highly_commended, points_commended, points_accepted
     FROM competitions WHERE id = $1`,
    [tok.competition_id],
  )
  const comp = compRes.rows[0]
  if (!comp) return null

  const judgeRes = await pool.query(`SELECT id, name FROM judges WHERE id = $1`, [tok.judge_id])
  const judge = judgeRes.rows[0]
  if (!judge) return null

  // Entries anonymised — join members for membership_number only, never name
  const entriesRes = await pool.query(
    `SELECT e.id, e.type, e.title,
            m.membership_number AS "memberNumber",
            e.drive_file_id AS "driveFileId",
            e.drive_file_url AS "driveFileUrl",
            e.drive_thumbnail_url AS "driveThumbnailUrl",
            e.award,
            e.judge_comment AS "judgeComment",
            e.judged_at AS "judgedAt"
     FROM entries e
     JOIN members m ON m.id = e.member_id
     WHERE e.competition_id = $1
     ORDER BY e.type DESC, e.submitted_at ASC`,
    [tok.competition_id],
  )
  const entries: JudgingEntry[] = entriesRes.rows
  const scoredCount = entries.filter(e => e.judgedAt !== null).length

  return {
    competition: {
      id: comp.id,
      name: comp.name,
      status: comp.status,
      judgingClosesAt: comp.judging_closes_at,
      pointsHonours: comp.points_honours,
      pointsHighlyCommended: comp.points_highly_commended,
      pointsCommended: comp.points_commended,
      pointsAccepted: comp.points_accepted,
    },
    judge: { id: judge.id, name: judge.name },
    entries,
    scoredCount,
  }
}

export async function scoreEntry(opts: {
  tokenValue: string
  entryId: string
  award: string | null
  comment: string | null
}): Promise<{ ok: true } | { error: string }> {
  const tok = await validateToken(opts.tokenValue, 'judging')
  if (!tok) return { error: 'Invalid or expired token' }

  const pool = getPool()

  // Verify entry belongs to this competition
  const check = await pool.query(
    `SELECT id FROM entries WHERE id = $1 AND competition_id = $2`,
    [opts.entryId, tok.competition_id],
  )
  if (!check.rows[0]) return { error: 'Entry not found' }

  // Validate award value
  const validAwards = ['honours', 'highly_commended', 'commended', 'accepted', 'winner', 'shortlisted', null]
  if (!validAwards.includes(opts.award)) return { error: 'Invalid award value' }

  await pool.query(
    `UPDATE entries
     SET award = $1,
         judge_comment = $2,
         judged_at = NOW(),
         judged_by = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [opts.award, opts.comment ?? null, tok.judge_id, opts.entryId],
  )

  return { ok: true }
}

function calcPoints(
  award: string | null,
  comp: { pointsHonours: number; pointsHighlyCommended: number; pointsCommended: number; pointsAccepted: number },
): number {
  switch (award) {
    case 'honours': return comp.pointsHonours
    case 'highly_commended': return comp.pointsHighlyCommended
    case 'commended': return comp.pointsCommended
    case 'accepted': return comp.pointsAccepted
    default: return 0
  }
}

export async function completeJudging(tokenValue: string): Promise<{ ok: true } | { error: string }> {
  const tok = await validateToken(tokenValue, 'judging')
  if (!tok) return { error: 'Invalid or expired token' }

  const pool = getPool()

  // Check competition is in judging status
  const compRes = await pool.query(
    `SELECT id, name, season_id, status,
            points_honours, points_highly_commended, points_commended, points_accepted
     FROM competitions WHERE id = $1`,
    [tok.competition_id],
  )
  const comp = compRes.rows[0]
  if (!comp) return { error: 'Competition not found' }
  if (comp.status !== 'judging') return { error: 'Competition is not in judging status' }

  // Get all entries
  const entriesRes = await pool.query(
    `SELECT id, member_id, type, award, judged_at FROM entries WHERE competition_id = $1`,
    [tok.competition_id],
  )
  const entries = entriesRes.rows

  if (entries.length === 0) return { error: 'No entries to judge' }

  const unscored = entries.filter((e: { judged_at: string | null }) => e.judged_at === null)
  if (unscored.length > 0) {
    return { error: `${unscored.length} entr${unscored.length === 1 ? 'y has' : 'ies have'} not been scored yet` }
  }

  const pointsCfg = {
    pointsHonours: comp.points_honours,
    pointsHighlyCommended: comp.points_highly_commended,
    pointsCommended: comp.points_commended,
    pointsAccepted: comp.points_accepted,
  }

  // Write points snapshot to entries and upsert member_points ledger
  for (const entry of entries) {
    const pts = calcPoints(entry.award, pointsCfg)

    await pool.query(
      `UPDATE entries SET points_awarded = $1 WHERE id = $2`,
      [pts, entry.id],
    )

    // Upsert to member_points ledger (unique on entry_id)
    await pool.query(
      `INSERT INTO member_points (member_id, season_id, competition_id, entry_id, entry_type, points)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (entry_id) DO UPDATE
         SET points = EXCLUDED.points, awarded_at = NOW()`,
      [entry.member_id, comp.season_id, comp.id, entry.id, entry.type, pts],
    )
  }

  // Advance competition to complete
  await pool.query(
    `UPDATE competitions SET status = 'complete', updated_at = NOW() WHERE id = $1`,
    [comp.id],
  )

  return { ok: true }
}
