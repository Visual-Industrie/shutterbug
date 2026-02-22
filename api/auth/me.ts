import type { VercelRequest, VercelResponse } from '@vercel/node'
import jwt from 'jsonwebtoken'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })

  const token = auth.slice(7)
  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' })

  try {
    const payload = jwt.verify(token, secret) as {
      sub: string; email: string; name: string; role: string
    }
    return res.status(200).json({
      user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role },
    })
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
