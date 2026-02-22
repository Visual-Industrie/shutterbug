import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/auth.js'
import { getPool } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const {
    name,
    event_type = 'competition',
    season_id,
    opens_at,
    closes_at,
    judging_opens_at,
    judging_closes_at,
    max_projim_entries = 1,
    max_printim_entries = 2,
    points_honours = 4,
    points_highly_commended = 3,
    points_commended = 2,
    points_accepted = 1,
  } = req.body ?? {}

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  if (!season_id) return res.status(400).json({ error: 'Season is required' })

  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO competitions (
       name, event_type, season_id, status,
       opens_at, closes_at, judging_opens_at, judging_closes_at,
       max_projim_entries, max_printim_entries,
       points_honours, points_highly_commended, points_commended, points_accepted
     ) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      name.trim(),
      event_type,
      season_id,
      opens_at || null,
      closes_at || null,
      judging_opens_at || null,
      judging_closes_at || null,
      max_projim_entries,
      max_printim_entries,
      points_honours,
      points_highly_commended,
      points_commended,
      points_accepted,
    ],
  )

  res.status(201).json({ id: result.rows[0].id })
}
