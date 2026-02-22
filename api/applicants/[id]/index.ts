import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const applicantId = req.query.id as string
  const { first_name, last_name, email, phone, annual_sub_amount, pay_by_date, status } = req.body ?? {}

  if (!first_name?.trim()) return res.status(400).json({ error: 'First name is required' })
  if (!last_name?.trim()) return res.status(400).json({ error: 'Last name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  const pool = getPool()
  const result = await pool.query(
    `UPDATE applicants SET
       first_name = $1, last_name = $2, email = $3, phone = $4,
       annual_sub_amount = $5, pay_by_date = $6, status = $7,
       updated_at = NOW()
     WHERE id = $8
     RETURNING id`,
    [
      first_name.trim(), last_name.trim(), email.trim().toLowerCase(), phone?.trim() || null,
      annual_sub_amount || null, pay_by_date || null, status || 'pending',
      applicantId,
    ],
  )

  if (result.rows.length === 0) return res.status(404).json({ error: 'Applicant not found' })
  res.json({ ok: true })
}
