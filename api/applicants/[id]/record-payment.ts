import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const applicantId = req.query.id as string
  const pool = getPool()

  const appRes = await pool.query(
    `SELECT * FROM applicants WHERE id = $1 AND status = 'pending'`,
    [applicantId],
  )
  const app = appRes.rows[0]
  if (!app) return res.status(404).json({ error: 'Applicant not found or already processed' })

  // Create member record
  const memberRes = await pool.query(
    `INSERT INTO members (
       first_name, last_name, email, phone,
       status, membership_type,
       annual_sub_amount, subs_paid, subs_paid_date, subs_paid_amount,
       privacy_act_ok, image_use_ok, club_rules_ok,
       joined_date
     ) VALUES ($1,$2,$3,$4,'active','full',$5,true,CURRENT_DATE,$5,$6,$7,$8,CURRENT_DATE)
     RETURNING id`,
    [
      app.first_name,
      app.last_name,
      app.email,
      app.phone,
      app.annual_sub_amount,
      app.privacy_act_ok,
      app.image_use_ok,
      app.club_rules_ok,
    ],
  )
  const memberId = memberRes.rows[0].id

  // Mark applicant approved
  await pool.query(
    `UPDATE applicants SET status = 'approved', updated_at = NOW() WHERE id = $1`,
    [applicantId],
  )

  res.status(200).json({ memberId })
}
