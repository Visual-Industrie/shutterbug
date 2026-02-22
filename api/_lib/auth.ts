// Shared auth helper for API route middleware
import type { VercelRequest, VercelResponse } from '@vercel/node'
import jwt from 'jsonwebtoken'

export interface AdminPayload {
  sub: string
  email: string
  name: string
  role: string
}

export function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): AdminPayload | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const secret = process.env.JWT_SECRET
  if (!secret) {
    res.status(500).json({ error: 'Server misconfigured' })
    return null
  }
  try {
    return jwt.verify(auth.slice(7), secret) as AdminPayload
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return null
  }
}
