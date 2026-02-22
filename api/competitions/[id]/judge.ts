import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const competitionId = req.query.id as string
  const { judge_id } = req.body ?? {}

  const pool = getPool()

  // Remove existing assignment
  await pool.query('DELETE FROM competition_judges WHERE competition_id = $1', [competitionId])

  // Assign new judge (if provided)
  if (judge_id) {
    await pool.query(
      'INSERT INTO competition_judges (competition_id, judge_id) VALUES ($1, $2)',
      [competitionId, judge_id],
    )
  }

  res.json({ ok: true })
}
