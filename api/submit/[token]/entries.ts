import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseUpload } from '../../_lib/parse-upload.js'
import { createEntry, deleteEntry } from '../../_lib/submission.js'
import { uploadToDrive, deleteFromDrive } from '../../_lib/drive.js'
import { getPool } from '../../_lib/db.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const tokenValue = req.query.token as string

  if (req.method === 'POST') {
    const { fields, file } = await parseUpload(req)
    const type = fields.type as 'projim' | 'printim'
    const title = fields.title ?? ''

    if (!type || !['projim', 'printim'].includes(type)) {
      return res.status(400).json({ error: 'type must be projim or printim' })
    }
    if (!title.trim()) return res.status(400).json({ error: 'Title is required' })

    // Upload to Drive if a file was provided
    let driveResult = null
    if (file && file.buffer.length > 0) {
      const compRes = await getPool().query(
        `SELECT c.id, c.name FROM competitions c
         JOIN tokens t ON t.competition_id = c.id
         WHERE t.token = $1`,
        [tokenValue],
      )
      const comp = compRes.rows[0]
      if (comp) {
        driveResult = await uploadToDrive({
          buffer: file.buffer,
          filename: file.filename || `${title}.jpg`,
          mimeType: file.mimeType || 'image/jpeg',
          competitionId: comp.id,
          competitionName: comp.name,
        })
      }
    }

    const result = await createEntry({
      tokenValue,
      type,
      title,
      driveFileId: driveResult?.driveFileId,
      driveFileUrl: driveResult?.driveFileUrl,
      driveThumbnailUrl: driveResult?.driveThumbnailUrl,
    })

    if ('error' in result) return res.status(400).json(result)
    return res.status(201).json(result)
  }

  if (req.method === 'DELETE') {
    const entryId = req.query.entryId as string
    if (!entryId) return res.status(400).json({ error: 'entryId required' })

    const result = await deleteEntry({ tokenValue, entryId })
    if ('error' in result) return res.status(400).json(result)

    // Clean up Drive file
    if (result.driveFileId) await deleteFromDrive(result.driveFileId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
