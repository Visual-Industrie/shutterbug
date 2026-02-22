import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSubmissionData } from '../../_lib/submission.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const tokenValue = req.query.token as string
  const data = await getSubmissionData(tokenValue)
  if (!data) return res.status(404).json({ error: 'Invalid or expired link' })

  res.status(200).json(data)
}
