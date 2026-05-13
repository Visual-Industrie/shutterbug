import * as pg from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const orphans = await db.query(`
    SELECT mp.id, mp.entry_id, mp.points
    FROM member_points mp
    WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = mp.entry_id)
  `)
  console.log(`Found ${orphans.rows.length} orphaned points records:`)
  if (orphans.rows.length) console.table(orphans.rows)

  if (orphans.rows.length > 0) {
    const del = await db.query(`
      DELETE FROM member_points
      WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = member_points.entry_id)
    `)
    console.log(`✅ Deleted ${del.rowCount} orphaned records.`)
  } else {
    console.log('✅ Nothing to clean up.')
  }
  await db.end()
}

main().catch(err => { console.error(err); process.exit(1) })
