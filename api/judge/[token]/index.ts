import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getJudgingData } from '../../_lib/judging.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const data = await getJudgingData(req.query.token as string)
  if (!data) return res.status(404).json({ error: 'Invalid or expired judging link' })
  res.status(200).json(data)
}
