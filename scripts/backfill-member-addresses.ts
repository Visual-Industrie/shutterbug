/**
 * Backfill member street addresses from WCCDatabase.xlsx → live Postgres.
 *
 * Idempotent and safe to run repeatedly:
 *   - ensures the members.address column exists (ADD COLUMN IF NOT EXISTS)
 *   - matches xlsx Contacts rows to members by membership_number = ContactID
 *   - only writes when the member's address is currently NULL/empty, so any
 *     manually-edited address is never overwritten.
 *
 * Dry run (prints what it would change, writes nothing):
 *   npx tsx scripts/backfill-member-addresses.ts
 *
 * Apply against production:
 *   npx tsx scripts/backfill-member-addresses.ts --apply
 *
 * Apply against local dev DB:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *   npx tsx scripts/backfill-member-addresses.ts --apply
 */

import XLSX from 'xlsx'
import * as pg from 'pg'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

const APPLY = process.argv.includes('--apply')
const XLSX_PATH = path.resolve(process.cwd(), 'click drive xlsx/WCCDatabase.xlsx')

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

async function main() {
  const host = (process.env.DATABASE_URL ?? 'local').replace(/:[^:@/]*@/, ':***@').split('@')[1] ?? 'local'
  console.log(`Target DB: ${host}`)
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`)

  // 1. Ensure column exists (idempotent).
  await db.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS address text`)

  // 2. Read xlsx member addresses, keyed by ContactID (= membership_number).
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true })
  const contacts = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Contacts'], { defval: null })

  const addressByMembershipNumber = new Map<string, string>()
  for (const c of contacts) {
    if (c['ContactType'] !== 'Member' || c['ContactID'] == null) continue
    const raw = c['StreetAddress']
    const address = raw == null ? '' : String(raw).trim()
    if (!address) continue
    addressByMembershipNumber.set(String(c['ContactID']), address)
  }
  console.log(`xlsx: ${addressByMembershipNumber.size} members have a street address\n`)

  // 3. Fill only where the DB address is currently missing.
  let updated = 0
  let alreadySet = 0
  let noMatch = 0
  const unmatched: string[] = []

  for (const [membershipNumber, address] of addressByMembershipNumber) {
    const found = await db.query(
      `SELECT id, address FROM members WHERE membership_number = $1`,
      [membershipNumber],
    )
    if (!found.rows.length) {
      noMatch++
      unmatched.push(membershipNumber)
      continue
    }
    const current = (found.rows[0].address ?? '').trim()
    if (current) {
      alreadySet++
      continue
    }
    if (APPLY) {
      await db.query(
        `UPDATE members SET address = $1, updated_at = NOW() WHERE id = $2`,
        [address, found.rows[0].id],
      )
    } else {
      console.log(`  would set [${membershipNumber}] → ${address}`)
    }
    updated++
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'}: ${updated}`)
  console.log(`Already had an address (left untouched): ${alreadySet}`)
  console.log(`No matching member in DB: ${noMatch}${noMatch ? ` (membership_numbers: ${unmatched.join(', ')})` : ''}`)

  const summary = await db.query(
    `SELECT COUNT(*) FILTER (WHERE address IS NOT NULL AND address <> '') AS with_address,
            COUNT(*) AS total
     FROM members`,
  )
  console.log(`\nDB now: ${summary.rows[0].with_address} / ${summary.rows[0].total} members have an address`)

  await db.end()
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
