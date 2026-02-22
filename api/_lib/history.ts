import { getPool } from './db.js'
import { validateToken } from './tokens.js'

export interface HistoryEntry {
  entryId: string
  competitionId: string
  competitionName: string
  seasonYear: number
  type: string
  title: string
  award: string | null
  pointsAwarded: number | null
  driveThumbnailUrl: string | null
  driveFileUrl: string | null
  submittedAt: string
}

export interface SeasonSummary {
  year: number
  projimPoints: number
  printimPoints: number
  totalPoints: number
  entries: HistoryEntry[]
}

export interface MemberHistoryData {
  member: {
    firstName: string
    lastName: string
    membershipNumber: string | null
    joinedDate: string | null
  }
  seasons: SeasonSummary[]
}

export async function getMemberHistory(tokenValue: string): Promise<MemberHistoryData | null> {
  const tok = await validateToken(tokenValue, 'member_history')
  if (!tok || !tok.member_id) return null

  const pool = getPool()

  const memberRes = await pool.query(
    `SELECT first_name, last_name, membership_number, joined_date
     FROM members WHERE id = $1`,
    [tok.member_id],
  )
  const member = memberRes.rows[0]
  if (!member) return null

  const entriesRes = await pool.query(
    `SELECT
       e.id AS "entryId",
       c.id AS "competitionId",
       c.name AS "competitionName",
       s.year AS "seasonYear",
       e.type,
       e.title,
       e.award,
       e.points_awarded AS "pointsAwarded",
       e.drive_thumbnail_url AS "driveThumbnailUrl",
       e.drive_file_url AS "driveFileUrl",
       e.submitted_at AS "submittedAt"
     FROM entries e
     JOIN competitions c ON c.id = e.competition_id
     JOIN seasons s ON s.id = c.season_id
     WHERE e.member_id = $1
       AND e.judged_at IS NOT NULL
     ORDER BY s.year DESC, c.opens_at DESC, e.submitted_at ASC`,
    [tok.member_id],
  )
  const rows: HistoryEntry[] = entriesRes.rows

  // Group by season year
  const seasonMap = new Map<number, SeasonSummary>()
  for (const row of rows) {
    if (!seasonMap.has(row.seasonYear)) {
      seasonMap.set(row.seasonYear, {
        year: row.seasonYear,
        projimPoints: 0,
        printimPoints: 0,
        totalPoints: 0,
        entries: [],
      })
    }
    const season = seasonMap.get(row.seasonYear)!
    season.entries.push(row)
    const pts = row.pointsAwarded ?? 0
    if (row.type === 'projim') season.projimPoints += pts
    else season.printimPoints += pts
    season.totalPoints += pts
  }

  return {
    member: {
      firstName: member.first_name,
      lastName: member.last_name,
      membershipNumber: member.membership_number,
      joinedDate: member.joined_date,
    },
    seasons: Array.from(seasonMap.values()),
  }
}
