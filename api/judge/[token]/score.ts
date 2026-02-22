import type { VercelRequest, VercelResponse } from '@vercel/node'
import { scoreEntry } from '../../_lib/judging.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return res.status(405).end()

  const { entryId, award, comment } = req.body ?? {}
  if (!entryId) return res.status(400).json({ error: 'entryId required' })

  const result = await scoreEntry({
    tokenValue: req.query.token as string,
    entryId,
    award: award ?? null,
    comment: comment ?? null,
  })

  if ('error' in result) return res.status(400).json(result)
  res.status(200).json(result)
}
