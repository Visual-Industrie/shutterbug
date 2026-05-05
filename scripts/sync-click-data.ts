/**
 * Sync script: WCCDatabase.xlsx → live Shutterbug Postgres (idempotent)
 *
 * Safe to run multiple times. Uses upsert / check-before-insert throughout.
 *
 * Run against production:
 *   npx tsx scripts/sync-click-data.ts
 *
 * Run against local dev DB:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *   npx tsx scripts/sync-click-data.ts
 */

import XLSX from 'xlsx'
import * as pg from 'pg'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

const XLSX_PATH = path.resolve(process.cwd(), 'click drive xlsx/WCCDatabase.xlsx')

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sheetToRows<T>(wb: XLSX.WorkBook, sheetName: string): T[] {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook`)
  return XLSX.utils.sheet_to_json<T>(ws, { defval: null })
}

function toDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (typeof val === 'string') return val.slice(0, 10)
  return null
}

function toTimestamp(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  const d = toDate(val)
  return d ? d + 'T00:00:00Z' : null
}

function mapScore(score: string | null): string | null {
  const map: Record<string, string> = {
    'Honours': 'honours',
    'Highly Commended': 'highly_commended',
    'Commended': 'commended',
    'Accepted': 'accepted',
    'Winner': 'winner',
    'Shortlisted': 'shortlisted',
  }
  return score ? (map[score] ?? null) : null
}

function mapSubsType(t: string | null): string {
  if (t === 'Life') return 'life'
  if (t === 'Complimentary') return 'complimentary'
  return 'full'
}

function mapStatus(s: string | null): string {
  if (!s) return 'inactive'
  if (s.includes('Current')) return 'active'
  if (s.includes('Ex-Member') || s.includes('Pending')) return 'inactive'
  return 'inactive'
}

function mapCompStatus(s: string | null): string {
  if (s === 'Completed') return 'complete'
  if (s === 'Judging') return 'judging'
  if (s === 'Open') return 'open'
  return 'draft'
}

function mapEventType(t: string | null): string {
  if (t === 'Award') return 'award'
  if (t === 'Competition') return 'competition'
  return 'other'
}

function mapExperience(e: string | null): string | null {
  if (!e) return null
  const lower = e.toLowerCase()
  if (lower.includes('beginner') || lower.includes('begin')) return 'beginner'
  if (lower.includes('advanced') || lower.includes('expert')) return 'advanced'
  if (lower.includes('intermediate')) return 'intermediate'
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading xlsx…')
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true })

  // ── Seasons ──────────────────────────────────────────────────────────────
  console.log('\n[1/6] Loading season UUIDs…')
  const seasonRows = await db.query('SELECT id, year FROM seasons')
  const seasonByYear = new Map<number, string>(
    seasonRows.rows.map((r: { id: string; year: number }) => [r.year, r.id])
  )
  console.log(`  Found ${seasonByYear.size} seasons in DB`)

  // ── Members ───────────────────────────────────────────────────────────────
  console.log('\n[2/6] Syncing members…')
  type ContactRow = Record<string, unknown>
  const contacts = sheetToRows<ContactRow>(wb, 'Contacts')

  const memberContacts = contacts.filter(
    c => c['ContactType'] === 'Member' && c['ContactID'] != null
  )

  const contactIdToMemberId = new Map<number, string>()
  let membersNew = 0
  let membersUpdated = 0

  for (const c of memberContacts) {
    const contactId = Number(c['ContactID'])
    const firstName = String(c['fFirstName'] ?? '').trim() || String(c['FullName'] ?? '').split(' ')[0]
    const lastName = String(c['fLastName'] ?? '').trim() || String(c['FullName'] ?? '').split(' ').slice(1).join(' ')
    const email = (c['Email'] as string | null) || `deleted_${contactId}@privacy.wcc.local`
    const phone = (c['Mobile'] as string | null) ?? (c['Landline'] as string | null) ?? null
    const membershipNumber = String(contactId)
    const status = mapStatus(c['fMemberStatus'] as string | null)
    const membershipType = mapSubsType(c['SubsType'] as string | null)
    const annualSubRaw = c['fAnnualSubs']
    const annualSubAmount = (annualSubRaw != null && annualSubRaw !== '') ? Number(annualSubRaw) : null
    const subsPaidDate = toDate(c['SubsPaidDate'])
    const subsPaidRaw = c['SubsPaidAmount']
    const subsPaidAmount = (subsPaidRaw != null && subsPaidRaw !== '') ? Number(subsPaidRaw) : null
    const subsPaid = subsPaidDate != null || subsPaidAmount != null
    const joinedDate = toDate(c['JoinedDate'])
    const notes = (c['Notes'] as string | null) ?? null
    const experience = mapExperience(c['Experience'] as string | null)

    const res = await db.query(
      `INSERT INTO members (
        first_name, last_name, email, phone, membership_number,
        status, membership_type,
        annual_sub_amount, subs_paid, subs_paid_date, subs_paid_amount,
        joined_date, experience_level, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (membership_number) DO UPDATE SET
        first_name        = EXCLUDED.first_name,
        last_name         = EXCLUDED.last_name,
        email             = CASE
                              WHEN members.email LIKE 'deleted_%@privacy.wcc.local'
                              THEN EXCLUDED.email
                              ELSE members.email
                            END,
        phone             = EXCLUDED.phone,
        status            = EXCLUDED.status,
        membership_type   = EXCLUDED.membership_type,
        annual_sub_amount = EXCLUDED.annual_sub_amount,
        subs_paid         = EXCLUDED.subs_paid,
        subs_paid_date    = EXCLUDED.subs_paid_date,
        subs_paid_amount  = EXCLUDED.subs_paid_amount,
        joined_date       = COALESCE(members.joined_date, EXCLUDED.joined_date),
        experience_level  = COALESCE(EXCLUDED.experience_level, members.experience_level),
        notes             = COALESCE(EXCLUDED.notes, members.notes)
      RETURNING id, (xmax = 0) AS inserted`,
      [
        firstName, lastName, email, phone, membershipNumber,
        status, membershipType,
        annualSubAmount, subsPaid, subsPaidDate, subsPaidAmount,
        joinedDate, experience, notes,
      ]
    )
    const row = res.rows[0]
    contactIdToMemberId.set(contactId, row.id as string)
    if (row.inserted) membersNew++
    else membersUpdated++
  }
  console.log(`  ${membersNew} new members, ${membersUpdated} updated`)

  // ── Judges ────────────────────────────────────────────────────────────────
  console.log('\n[3/6] Syncing judges…')
  const judgeContacts = contacts.filter(
    c => c['ContactType'] === 'Judge' && c['ContactID'] != null
  )

  const contactIdToJudgeId = new Map<number, string>()
  let judgesNew = 0
  let judgesUpdated = 0

  for (const c of judgeContacts) {
    const contactId = Number(c['ContactID'])
    const name = String(c['FullName'] ?? '').trim()
    const email = (c['Email'] as string | null) ?? `judge_${contactId}@placeholder.local`
    const bio = (c['JudgeBio'] as string | null) ?? null
    const address = (c['StreetAddress'] as string | null) ?? null
    const rating = (c['JudgeRating'] as number | null) ?? null
    const photoUrl = (c['JudgeImageShareLink'] as string | null) ?? null
    const isAvailable = c['Availabilty'] === 'Yes' || c['Availabilty'] == null

    const existing = await db.query('SELECT id FROM judges WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      const judgeId = existing.rows[0].id as string
      contactIdToJudgeId.set(contactId, judgeId)
      await db.query(
        `UPDATE judges SET
           name         = $1,
           bio          = COALESCE($2, bio),
           address      = COALESCE($3, address),
           rating       = COALESCE($4, rating),
           is_available = $5
         WHERE id = $6`,
        [name, bio, address, rating, isAvailable, judgeId]
      )
      judgesUpdated++
    } else {
      const res = await db.query(
        `INSERT INTO judges (name, email, bio, address, photo_drive_url, rating, is_available)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [name, email, bio, address, photoUrl, rating, isAvailable]
      )
      const judgeId = res.rows[0].id as string
      contactIdToJudgeId.set(contactId, judgeId)
      judgesNew++
    }
  }
  console.log(`  ${judgesNew} new judges, ${judgesUpdated} updated`)

  // ── Competitions ──────────────────────────────────────────────────────────
  // Match by (season_id, name) to avoid duplicates on re-run
  console.log('\n[4/6] Syncing competitions…')
  type CompRow = Record<string, unknown>
  const compRows = sheetToRows<CompRow>(wb, 'Competitions')
    .filter(r => r['CompetitionID'] != null)

  // Build lookup of existing competitions: "seasonId|name" → uuid
  const existingComps = await db.query('SELECT id, season_id, name FROM competitions')
  const existingCompMap = new Map<string, string>(
    existingComps.rows.map((r: { id: string; season_id: string; name: string }) =>
      [`${r.season_id}|${r.name.trim()}`, r.id]
    )
  )

  const clickCompIdToUuid = new Map<string, string>()
  let compsNew = 0
  let compsSkipped = 0

  for (const c of compRows) {
    const clickId = String(c['CompetitionID'])
    const year = c['fCompYear'] as number | null
    const seasonId = year ? seasonByYear.get(year) : null
    if (!seasonId) {
      console.warn(`  SKIP competition ${clickId} — no season for year ${year}`)
      compsSkipped++
      continue
    }

    const name = String(c['CompetitionName'] ?? '').trim()
    const lookupKey = `${seasonId}|${name}`
    const existing = existingCompMap.get(lookupKey)

    if (existing) {
      clickCompIdToUuid.set(clickId, existing)
      compsSkipped++
      continue
    }

    const eventType = mapEventType(c['Type'] as string | null)
    const status = mapCompStatus(c['Status'] as string | null)
    const opensAt = toTimestamp(c['Open for Entries'])
    const closesAt = toTimestamp(c['Close for Entries'])
    const judgingClosesAt = toTimestamp(c['JudgingAnnounced'])

    const res = await db.query(
      `INSERT INTO competitions (
        season_id, event_type, name, description,
        opens_at, closes_at, judging_closes_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [
        seasonId, eventType, name,
        (c['Guidance'] as string | null) ?? null,
        opensAt, closesAt, judgingClosesAt, status,
      ]
    )
    const compUuid = res.rows[0].id as string
    clickCompIdToUuid.set(clickId, compUuid)
    existingCompMap.set(lookupKey, compUuid)

    const judgeContactId = c['JudgeID'] ? Number(c['JudgeID']) : null
    if (judgeContactId) {
      const judgeUuid = contactIdToJudgeId.get(judgeContactId)
      if (judgeUuid) {
        await db.query(
          `INSERT INTO competition_judges (competition_id, judge_id)
           VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [compUuid, judgeUuid]
        )
      }
    }
    compsNew++
  }
  console.log(`  ${compsNew} new competitions, ${compsSkipped} already existed or skipped`)

  // ── Entries ───────────────────────────────────────────────────────────────
  // Match by (competition_id, member_id, title, type) to avoid duplicates
  console.log('\n[5/6] Syncing entries…')
  type EntryRow = Record<string, unknown>
  const entryRows = sheetToRows<EntryRow>(wb, 'Competition Entries')
    .filter(r => r['Entry#'] != null)

  // Build a set of existing entries for dedup: "compId|memberId|title|type"
  const existingEntries = await db.query(
    `SELECT competition_id, member_id, title, type FROM entries`
  )
  const existingEntrySet = new Set<string>(
    existingEntries.rows.map(
      (r: { competition_id: string; member_id: string; title: string; type: string }) =>
        `${r.competition_id}|${r.member_id}|${r.title.trim().toLowerCase()}|${r.type}`
    )
  )

  let entriesNew = 0
  let entriesSkipped = 0

  for (const e of entryRows) {
    const clickCompId = String(e['CompetitionID'] ?? '')
    const compUuid = clickCompIdToUuid.get(clickCompId)
    const contactId = e['ContactID'] ? Number(e['ContactID']) : null
    const memberUuid = contactId ? contactIdToMemberId.get(contactId) : null

    if (!compUuid || !memberUuid) {
      entriesSkipped++
      continue
    }

    const rawType = String(e['Type'] ?? '').toLowerCase()
    const entryType = rawType === 'projim' ? 'projim' : 'printim'
    const title = String(e['Title'] ?? '').trim() || 'Untitled'

    const dupKey = `${compUuid}|${memberUuid}|${title.toLowerCase()}|${entryType}`
    if (existingEntrySet.has(dupKey)) {
      entriesSkipped++
      continue
    }

    const award = mapScore(e['Score'] as string | null)
    const points = (e['fPoints'] as number | null) ?? null

    const judgeRes = await db.query(
      `SELECT j.id FROM judges j
       JOIN competition_judges cj ON cj.judge_id = j.id
       WHERE cj.competition_id = $1 LIMIT 1`,
      [compUuid]
    )
    const judgedBy = judgeRes.rows[0]?.id ?? null

    const driveFileUrl = (e['Image URL'] as string | null) ?? null
    const driveThumbnailUrl = (e['Image Softr'] as string | null) ?? null
    const driveFileId = driveFileUrl
      ? driveFileUrl.match(/\/d\/([^/]+)/)?.[1] ?? null
      : null

    await db.query(
      `INSERT INTO entries (
        competition_id, member_id, type, title,
        drive_file_id, drive_file_url, drive_thumbnail_url,
        award, judge_comment, judged_by, points_awarded, judged_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        compUuid, memberUuid, entryType, title,
        driveFileId, driveFileUrl, driveThumbnailUrl,
        award,
        (e['Judges Comments'] as string | null) ?? null,
        award ? judgedBy : null,
        award ? points : null,
        award ? toTimestamp(e['fCompetitionDate']) : null,
      ]
    )
    existingEntrySet.add(dupKey)
    entriesNew++
  }
  console.log(`  ${entriesNew} new entries, ${entriesSkipped} already existed or skipped`)

  // ── Member Points Ledger ──────────────────────────────────────────────────
  console.log('\n[6/6] Syncing member_points ledger…')

  const scoredEntries = await db.query(`
    SELECT e.id, e.member_id, e.competition_id, e.type, e.points_awarded, e.judged_at,
           c.season_id
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    WHERE e.points_awarded IS NOT NULL AND e.points_awarded > 0
  `)

  let pointsNew = 0
  for (const row of scoredEntries.rows) {
    const res = await db.query(
      `INSERT INTO member_points (member_id, season_id, competition_id, entry_id, entry_type, points, awarded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (entry_id) DO NOTHING`,
      [
        row.member_id, row.season_id, row.competition_id,
        row.id, row.type, row.points_awarded,
        row.judged_at ?? new Date().toISOString(),
      ]
    )
    if (res.rowCount && res.rowCount > 0) pointsNew++
  }
  console.log(`  ${pointsNew} new points ledger entries written`)

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Sync complete!')
  const counts = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM members)       AS members,
      (SELECT COUNT(*) FROM judges)        AS judges,
      (SELECT COUNT(*) FROM competitions)  AS competitions,
      (SELECT COUNT(*) FROM entries)       AS entries,
      (SELECT COUNT(*) FROM member_points) AS points
  `)
  console.table(counts.rows[0])

  await db.end()
}

main().catch(err => {
  console.error('Sync failed:', err)
  process.exit(1)
})
