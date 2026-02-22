import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { first_name, last_name, email, phone, privacy_act_ok, image_use_ok, club_rules_ok } = req.body ?? {}

  if (!first_name?.trim()) return res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })
  if (!privacy_act_ok) return res.status(400).json({ error: 'Privacy Act consent is required' })
  if (!image_use_ok) return res.status(400).json({ error: 'Image use consent is required' })
  if (!club_rules_ok) return res.status(400).json({ error: 'Club rules agreement is required' })

  const pool = getPool()

  // Check for duplicate email
  const existing = await pool.query(
    `SELECT id FROM applicants WHERE email = $1 AND status = 'pending'`,
    [email.trim().toLowerCase()],
  )
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'An application with this email is already pending' })
  }

  const result = await pool.query(
    `INSERT INTO applicants (first_name, last_name, email, phone, privacy_act_ok, image_use_ok, club_rules_ok, status, application_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_DATE)
     RETURNING id`,
    [
      first_name.trim(),
      last_name.trim(),
      email.trim().toLowerCase(),
      phone?.trim() || null,
      true,
      true,
      true,
    ],
  )

  res.status(201).json({ id: result.rows[0].id })
}
