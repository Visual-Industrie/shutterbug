import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/auth.js'
import { getPool } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const {
    first_name, last_name, email, phone,
    membership_number, status = 'active', membership_type = 'full',
    experience_level, subs_paid = false, subs_due_date,
    joined_date, annual_sub_amount,
    privacy_act_ok = false, image_use_ok = false, club_rules_ok = false,
  } = req.body ?? {}

  if (!first_name?.trim()) return res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO members (
       first_name, last_name, email, phone,
       membership_number, status, membership_type,
       experience_level, subs_paid, subs_due_date,
       annual_sub_amount, joined_date,
       privacy_act_ok, image_use_ok, club_rules_ok
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
      membership_number?.trim() || null, status, membership_type,
      experience_level || null, subs_paid, subs_due_date || null,
      annual_sub_amount || null, joined_date || null,
      privacy_act_ok, image_use_ok, club_rules_ok,
    ],
  )

  res.status(201).json({ id: result.rows[0].id })
}
