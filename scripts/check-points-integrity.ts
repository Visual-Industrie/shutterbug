import * as pg from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  let allOk = true

  // 1. Scored entries missing from member_points
  const missing = await db.query(`
    SELECT e.id AS entry_id, e.title, e.type, e.points_awarded,
           m.first_name || ' ' || m.last_name AS member_name,
           c.name AS competition
    FROM entries e
    JOIN members m ON m.id = e.member_id
    JOIN competitions c ON c.id = e.competition_id
    WHERE e.points_awarded IS NOT NULL AND e.points_awarded > 0
      AND NOT EXISTS (SELECT 1 FROM member_points mp WHERE mp.entry_id = e.id)
    ORDER BY c.name, m.last_name
  `)
  if (missing.rows.length) {
    allOk = false
    console.log(`\n❌ ${missing.rows.length} scored entries MISSING from member_points:`)
    console.table(missing.rows)
  } else {
    console.log('✅ No scored entries missing from member_points')
  }

  // 2. member_points rows where points value doesn't match the entry
  const mismatch = await db.query(`
    SELECT mp.id, mp.points AS ledger_points, e.points_awarded AS entry_points,
           e.title, m.first_name || ' ' || m.last_name AS member_name
    FROM member_points mp
    JOIN entries e ON e.id = mp.entry_id
    JOIN members m ON m.id = mp.member_id
    WHERE mp.points != e.points_awarded
  `)
  if (mismatch.rows.length) {
    allOk = false
    console.log(`\n❌ ${mismatch.rows.length} member_points rows with MISMATCHED points:`)
    console.table(mismatch.rows)
  } else {
    console.log('✅ All member_points values match their entry points_awarded')
  }

  // 3. Orphaned member_points (entry deleted without cleaning up)
  const orphans = await db.query(`
    SELECT mp.id, mp.entry_id, mp.points
    FROM member_points mp
    WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = mp.entry_id)
  `)
  if (orphans.rows.length) {
    allOk = false
    console.log(`\n❌ ${orphans.rows.length} orphaned member_points rows (no matching entry):`)
    console.table(orphans.rows)
  } else {
    console.log('✅ No orphaned member_points rows')
  }

  // 4. Season/competition mismatch (mp.season_id doesn't match the entry's competition's season)
  const wrongSeason = await db.query(`
    SELECT mp.id, mp.season_id AS ledger_season, c.season_id AS actual_season,
           e.title, m.first_name || ' ' || m.last_name AS member_name
    FROM member_points mp
    JOIN entries e ON e.id = mp.entry_id
    JOIN competitions c ON c.id = e.competition_id
    JOIN members m ON m.id = mp.member_id
    WHERE mp.season_id != c.season_id
  `)
  if (wrongSeason.rows.length) {
    allOk = false
    console.log(`\n❌ ${wrongSeason.rows.length} member_points rows with wrong season_id:`)
    console.table(wrongSeason.rows)
  } else {
    console.log('✅ All member_points season_ids are correct')
  }

  // 5. Summary totals per member for current season
  console.log('\n📊 Current season leaderboard totals (from member_points):')
  const totals = await db.query(`
    SELECT m.first_name || ' ' || m.last_name AS member,
           SUM(mp.points) FILTER (WHERE mp.entry_type = 'projim')  AS projim,
           SUM(mp.points) FILTER (WHERE mp.entry_type = 'printim') AS printim,
           SUM(mp.points) AS total
    FROM member_points mp
    JOIN members m ON m.id = mp.member_id
    JOIN seasons s ON s.id = mp.season_id AND s.is_current_event_year = true
    GROUP BY m.id, m.first_name, m.last_name
    ORDER BY total DESC
  `)
  console.table(totals.rows)

  if (allOk) console.log('\n✅ All checks passed — leaderboard data is consistent.')
  else console.log('\n⚠️  Issues found above need attention.')

  await db.end()
}

main().catch(err => { console.error(err); process.exit(1) })
