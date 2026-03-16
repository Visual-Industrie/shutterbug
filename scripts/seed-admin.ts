/**
 * Creates the first admin user.
 * Usage: npx tsx scripts/seed-admin.ts
 *
 * Set DATABASE_URL in .env.local before running.
 */
import * as bcrypt from 'bcryptjs'
import * as pg from 'pg'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const EMAIL = 'admin@wcc.local'
const PASSWORD = 'changeme123'
const NAME = 'Super Admin'
const ROLE = 'super_admin'

async function main() {
  console.log('Connecting to:', process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ':***@'))
  const hash = await bcrypt.hash(PASSWORD, 12)
  console.log('Hashed password, inserting...')

  await pool.query(
    `INSERT INTO admin_users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           role = EXCLUDED.role`,
    [EMAIL, hash, NAME, ROLE]
  )

  console.log(`Admin user ready:`)
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  Role:     ${ROLE}`)
  console.log()
  console.log('Change the password after first login.')

  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
