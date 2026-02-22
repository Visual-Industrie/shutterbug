import type { VercelRequest, VercelResponse } from '@vercel/node'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const result = await pool.query(
    'SELECT id, email, name, role, password_hash FROM admin_users WHERE email = $1',
    [email]
  )
  const admin = result.rows[0]
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, admin.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' })

  const token = jwt.sign(
    { sub: admin.id, email: admin.email, name: admin.name, role: admin.role },
    secret,
    { expiresIn: '7d' }
  )

  await pool.query('UPDATE admin_users SET last_login_at = NOW() WHERE id = $1', [admin.id])

  return res.status(200).json({
    token,
    user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  })
}
