/**
 * Parses a multipart/form-data request using busboy.
 * Works in both Node.js (Vercel functions) and Express.
 */
import busboy from 'busboy'
import { IncomingMessage } from 'http'

export interface ParsedUpload {
  fields: Record<string, string>
  file: {
    filename: string
    mimeType: string
    buffer: Buffer
  } | null
}

export function parseUpload(req: IncomingMessage): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers as Record<string, string>, limits: { fileSize: 50 * 1024 * 1024 } })
    const fields: Record<string, string> = {}
    let file: ParsedUpload['file'] = null

    bb.on('field', (name, value) => { fields[name] = value })

    bb.on('file', (fieldname, fileStream, info) => {
      const chunks: Buffer[] = []
      fileStream.on('data', (chunk: Buffer) => chunks.push(chunk))
      fileStream.on('end', () => {
        file = {
          filename: info.filename,
          mimeType: info.mimeType,
          buffer: Buffer.concat(chunks),
        }
      })
    })

    bb.on('finish', () => resolve({ fields, file }))
    bb.on('error', reject)

    req.pipe(bb)
  })
}
