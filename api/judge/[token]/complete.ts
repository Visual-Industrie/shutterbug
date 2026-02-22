import type { VercelRequest, VercelResponse } from '@vercel/node'
import { completeJudging } from '../../_lib/judging.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const result = await completeJudging(req.query.token as string)
  if ('error' in result) return res.status(400).json(result)
  res.status(200).json(result)
}
