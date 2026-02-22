import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/auth.js'
import { getPool } from '../_lib/db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const { name, email, bio, address, rating, is_available = true } = req.body ?? {}

  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

  const pool = getPool()
  const result = await pool.query(
    `INSERT INTO judges (name, email, bio, address, rating, is_available)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      name.trim(), email.trim().toLowerCase(),
      bio?.trim() || null, address?.trim() || null,
      rating != null && rating !== '' ? parseFloat(rating) : null,
      is_available,
    ],
  )

  res.status(201).json({ id: result.rows[0].id })
}
