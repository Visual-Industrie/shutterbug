import { getPool } from './db.js'
import { validateToken } from './tokens.js'

export interface CompetitionInfo {
  id: string
  name: string
  status: string
  closes_at: string | null
  max_projim_entries: number
  max_printim_entries: number
}

export interface MemberInfo {
  id: string
  first_name: string
  last_name: string
  membership_number: string | null
}

export interface EntryInfo {
  id: string
  type: string
  title: string
  drive_file_url: string | null
  drive_thumbnail_url: string | null
  submitted_at: string
}

export interface SubmissionPageData {
  competition: CompetitionInfo
  member: MemberInfo
  entries: EntryInfo[]
  projimCount: number
  printimCount: number
}

export async function getSubmissionData(tokenValue: string): Promise<SubmissionPageData | null> {
  const tok = await validateToken(tokenValue, 'submission')
  if (!tok) return null

  const pool = getPool()

  const compRes = await pool.query<CompetitionInfo>(
    `SELECT id, name, status, closes_at, max_projim_entries, max_printim_entries
     FROM competitions WHERE id = $1`,
    [tok.competition_id],
  )
  const competition = compRes.rows[0]
  if (!competition) return null

  const memberRes = await pool.query<MemberInfo>(
    `SELECT id, first_name, last_name, membership_number FROM members WHERE id = $1`,
    [tok.member_id],
  )
  const member = memberRes.rows[0]
  if (!member) return null

  const entriesRes = await pool.query<EntryInfo>(
    `SELECT id, type, title, drive_file_url, drive_thumbnail_url, submitted_at
     FROM entries WHERE competition_id = $1 AND member_id = $2
     ORDER BY submitted_at ASC`,
    [tok.competition_id, tok.member_id],
  )
  const entries = entriesRes.rows

  return {
    competition,
    member,
    entries,
    projimCount: entries.filter(e => e.type === 'projim').length,
    printimCount: entries.filter(e => e.type === 'printim').length,
  }
}

export async function createEntry(opts: {
  tokenValue: string
  type: 'projim' | 'printim'
  title: string
  driveFileId?: string | null
  driveFileUrl?: string | null
  driveThumbnailUrl?: string | null
}): Promise<{ id: string } | { error: string }> {
  const pool = getPool()
  const tok = await validateToken(opts.tokenValue, 'submission')
  if (!tok) return { error: 'Invalid or expired token' }

  // Check competition is still open
  const compRes = await pool.query(
    `SELECT status, max_projim_entries, max_printim_entries, closes_at FROM competitions WHERE id = $1`,
    [tok.competition_id],
  )
  const comp = compRes.rows[0]
  if (!comp) return { error: 'Competition not found' }
  if (comp.status !== 'open') return { error: 'Competition is not open for submissions' }
  if (comp.closes_at && new Date(comp.closes_at) < new Date()) {
    return { error: 'Competition submission window has closed' }
  }

  // Check entry limits
  const countRes = await pool.query(
    `SELECT type, COUNT(*) AS cnt FROM entries
     WHERE competition_id = $1 AND member_id = $2
     GROUP BY type`,
    [tok.competition_id, tok.member_id],
  )
  const counts = Object.fromEntries(countRes.rows.map((r: { type: string; cnt: string }) => [r.type, parseInt(r.cnt, 10)]))

  if (opts.type === 'projim' && (counts.projim ?? 0) >= comp.max_projim_entries) {
    return { error: `You can only submit ${comp.max_projim_entries} PROJIM entry per competition` }
  }
  if (opts.type === 'printim' && (counts.printim ?? 0) >= comp.max_printim_entries) {
    return { error: `You can only submit ${comp.max_printim_entries} PRINTIM entries per competition` }
  }

  const res = await pool.query(
    `INSERT INTO entries (competition_id, member_id, type, title, drive_file_id, drive_file_url, drive_thumbnail_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      tok.competition_id,
      tok.member_id,
      opts.type,
      opts.title.trim(),
      opts.driveFileId ?? null,
      opts.driveFileUrl ?? null,
      opts.driveThumbnailUrl ?? null,
    ],
  )
  return { id: res.rows[0].id }
}

export async function deleteEntry(opts: {
  tokenValue: string
  entryId: string
}): Promise<{ driveFileId?: string | null } | { error: string }> {
  const pool = getPool()
  const tok = await validateToken(opts.tokenValue, 'submission')
  if (!tok) return { error: 'Invalid or expired token' }

  // Verify the entry belongs to this member/competition
  const res = await pool.query(
    `SELECT id, drive_file_id FROM entries
     WHERE id = $1 AND competition_id = $2 AND member_id = $3`,
    [opts.entryId, tok.competition_id, tok.member_id],
  )
  const entry = res.rows[0]
  if (!entry) return { error: 'Entry not found' }

  // Check competition is still open
  const compRes = await pool.query(
    `SELECT status FROM competitions WHERE id = $1`,
    [tok.competition_id],
  )
  if (compRes.rows[0]?.status !== 'open') return { error: 'Competition is no longer open' }

  await pool.query(`DELETE FROM entries WHERE id = $1`, [entry.id])
  return { driveFileId: entry.drive_file_id }
}
