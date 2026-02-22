import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const competitionId = req.query.id as string
  const {
    name, event_type, opens_at, closes_at, judging_opens_at, judging_closes_at,
    max_projim_entries, max_printim_entries,
    points_honours, points_highly_commended, points_commended, points_accepted,
  } = req.body ?? {}

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

  const pool = getPool()
  const result = await pool.query(
    `UPDATE competitions SET
       name = $1, event_type = $2,
       opens_at = $3, closes_at = $4, judging_opens_at = $5, judging_closes_at = $6,
       max_projim_entries = $7, max_printim_entries = $8,
       points_honours = $9, points_highly_commended = $10, points_commended = $11, points_accepted = $12,
       updated_at = NOW()
     WHERE id = $13
     RETURNING id`,
    [
      name.trim(), event_type || 'competition',
      opens_at || null, closes_at || null, judging_opens_at || null, judging_closes_at || null,
      max_projim_entries ?? 1, max_printim_entries ?? 2,
      points_honours ?? 4, points_highly_commended ?? 3, points_commended ?? 2, points_accepted ?? 1,
      competitionId,
    ],
  )

  if (result.rows.length === 0) return res.status(404).json({ error: 'Competition not found' })
  res.json({ ok: true })
}
