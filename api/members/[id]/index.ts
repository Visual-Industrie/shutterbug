import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const memberId = req.query.id as string
  const {
    first_name, last_name, email, phone,
    membership_number, status, membership_type,
    experience_level, subs_paid, subs_due_date,
    joined_date, annual_sub_amount,
  } = req.body ?? {}

  if (!first_name?.trim()) return res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  const pool = getPool()
  const result = await pool.query(
    `UPDATE members SET
       first_name = $1, last_name = $2, email = $3, phone = $4,
       membership_number = $5, status = $6, membership_type = $7,
       experience_level = $8, subs_paid = $9, subs_due_date = $10,
       joined_date = $11, annual_sub_amount = $12,
       updated_at = NOW()
     WHERE id = $13
     RETURNING id`,
    [
      first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
      membership_number?.trim() || null, status, membership_type,
      experience_level || null, subs_paid ?? false, subs_due_date || null,
      joined_date || null, annual_sub_amount || null,
      memberId,
    ],
  )

  if (result.rows.length === 0) return res.status(404).json({ error: 'Member not found' })
  res.json({ ok: true })
}
