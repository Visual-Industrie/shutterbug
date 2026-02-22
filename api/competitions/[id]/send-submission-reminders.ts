import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../../_lib/auth.js'
import { sendSubmissionReminders } from '../../_lib/competition-actions.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const user = requireAuth(req, res)
  if (!user) return

  const competitionId = req.query.id as string
  try {
    const result = await sendSubmissionReminders(competitionId)
    res.status(200).json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(400).json({ error: msg })
  }
}
