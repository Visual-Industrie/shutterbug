import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { getPool } from '../../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const judgeId = req.query.id as string
  const { name, email, bio, address, rating, is_available } = req.body ?? {}

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  const pool = getPool()
  const result = await pool.query(
    `UPDATE judges SET
       name = $1, email = $2, bio = $3, address = $4,
       rating = $5, is_available = $6,
       updated_at = NOW()
     WHERE id = $7
     RETURNING id`,
    [
      name.trim(), email.trim().toLowerCase(),
      bio?.trim() || null, address?.trim() || null,
      rating != null && rating !== '' ? parseFloat(rating) : null,
      is_available ?? true,
      judgeId,
    ],
  )

  if (result.rows.length === 0) return res.status(404).json({ error: 'Judge not found' })
  res.json({ ok: true })
}
