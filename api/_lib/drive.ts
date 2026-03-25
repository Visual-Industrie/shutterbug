import { google } from 'googleapis'
import { Readable } from 'stream'
import { getPool } from './db.js'

async function getAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Prefer token stored in DB; fall back to env var
  let refreshToken = process.env.GOOGLE_REFRESH_TOKEN ?? null
  try {
    const res = await getPool().query(`SELECT refresh_token FROM google_oauth_tokens WHERE id = 1`)
    if (res.rows[0]?.refresh_token) refreshToken = res.rows[0].refresh_token
  } catch {
    // DB not available or table doesn't exist yet — use env var
  }

  if (!refreshToken) return null
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  return oauth2
}

/** Finds or creates a Drive folder by name inside a given parent. Supports Shared Drives. */
async function ensureFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string,
): Promise<string> {
  const res = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  if (res.data.files?.[0]?.id) return res.data.files[0].id
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  })
  return created.data.id!
}

/** Builds folder path Root > YYYY > MM - CompName and returns the leaf folderId. */
async function ensureFolderPath(
  drive: ReturnType<typeof google.drive>,
  competitionName: string,
  judgingClosesAt?: string | null,
): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootFolderId) return 'root'
  const date = judgingClosesAt ? new Date(judgingClosesAt) : new Date()
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const yearFolderId = await ensureFolder(drive, year, rootFolderId)
  return ensureFolder(drive, `${month} - ${competitionName}`, yearFolderId)
}

/**
 * Creates a Google Drive resumable upload session and returns the upload URL.
 * The browser can PUT the file bytes directly to this URL — Vercel is not in the path.
 */
export async function createDriveUploadSession(opts: {
  competitionName: string
  judgingClosesAt?: string | null
}): Promise<string | null> {
  const auth = await getAuth()
  if (!auth) return null

  const drive = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolderPath(drive, opts.competitionName, opts.judgingClosesAt)
  const { token } = await auth.getAccessToken()
  if (!token) return null

  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'pending', parents: [folderId] }),
    },
  )
  if (!initRes.ok) throw new Error(`Drive resumable init failed: ${initRes.status}`)
  const uploadUrl = initRes.headers.get('location')
  if (!uploadUrl) throw new Error('Drive did not return a Location header')
  return uploadUrl
}

/**
 * Replaces a Drive file's content with processedBuffer and renames it.
 * Sets public reader permission and returns URLs.
 */
export async function processDriveFile(opts: {
  driveFileId: string
  filename: string
  processedBuffer: Buffer
  thumbnailBuffer?: Buffer
  competitionFolderId?: string
}): Promise<{ driveFileUrl: string; driveThumbnailUrl: string }> {
  const auth = await getAuth()
  if (!auth) throw new Error('Drive not configured')

  const drive = google.drive({ version: 'v3', auth })
  const stream = Readable.from(opts.processedBuffer)

  const updated = await drive.files.update({
    fileId: opts.driveFileId,
    requestBody: { name: opts.filename },
    media: { mimeType: 'image/jpeg', body: stream },
    fields: 'id,webViewLink,parents',
    supportsAllDrives: true,
  })

  await drive.permissions.create({
    fileId: opts.driveFileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  let driveThumbnailUrl = `https://drive.google.com/thumbnail?id=${opts.driveFileId}&sz=w400`
  if (opts.thumbnailBuffer) {
    try {
      const parentId = opts.competitionFolderId ?? updated.data.parents?.[0]
      if (parentId) {
        const thumbFolderId = await ensureFolder(drive, 'thumbnails', parentId)
        const thumbStream = Readable.from(opts.thumbnailBuffer)
        const thumbUploaded = await drive.files.create({
          requestBody: { name: opts.filename, parents: [thumbFolderId] },
          media: { mimeType: 'image/jpeg', body: thumbStream },
          fields: 'id',
          supportsAllDrives: true,
        })
        const thumbId = thumbUploaded.data.id!
        await drive.permissions.create({
          fileId: thumbId,
          requestBody: { role: 'reader', type: 'anyone' },
          supportsAllDrives: true,
        })
        driveThumbnailUrl = `https://drive.google.com/thumbnail?id=${thumbId}&sz=w600`
      }
    } catch (err) {
      console.warn('[Drive] Thumbnail upload failed, falling back to full-res thumbnail URL', err)
    }
  }

  return {
    driveFileUrl: updated.data.webViewLink ?? `https://drive.google.com/file/d/${opts.driveFileId}/view`,
    driveThumbnailUrl,
  }
}

/** Downloads a file from Drive into memory and returns a Buffer. */
export async function downloadFromDrive(driveFileId: string): Promise<Buffer> {
  const auth = await getAuth()
  if (!auth) throw new Error('Drive not configured')

  const { token } = await auth.getAccessToken()
  if (!token) throw new Error('Could not get Drive access token')

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function uploadToDrive(opts: {
  buffer: Buffer
  thumbnailBuffer?: Buffer
  filename: string
  mimeType: string
  competitionId: string
  competitionName: string
  judgingClosesAt?: string | null
}): Promise<{ driveFileId: string; driveFileUrl: string; driveThumbnailUrl: string } | null> {
  const auth = await getAuth()
  if (!auth) {
    console.log('[Drive] No service account configured — skipping upload')
    return null
  }

  const drive = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolderPath(drive, opts.competitionName, opts.judgingClosesAt)

  // Upload the full-res file
  const stream = new Readable()
  stream.push(opts.buffer)
  stream.push(null)

  const uploaded = await drive.files.create({
    requestBody: { name: opts.filename, parents: [folderId] },
    media: { mimeType: opts.mimeType, body: stream },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })

  const fileId = uploaded.data.id!

  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  // Upload thumbnail to thumbnails/ subfolder
  let driveThumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
  if (opts.thumbnailBuffer) {
    try {
      const thumbFolderId = await ensureFolder(drive, 'thumbnails', folderId)
      const thumbStream = new Readable()
      thumbStream.push(opts.thumbnailBuffer)
      thumbStream.push(null)
      const thumbUploaded = await drive.files.create({
        requestBody: { name: opts.filename, parents: [thumbFolderId] },
        media: { mimeType: 'image/jpeg', body: thumbStream },
        fields: 'id,webViewLink',
        supportsAllDrives: true,
      })
      const thumbId = thumbUploaded.data.id!
      await drive.permissions.create({
        fileId: thumbId,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      })
      driveThumbnailUrl = `https://drive.google.com/thumbnail?id=${thumbId}&sz=w600`
    } catch (err) {
      console.warn('[Drive] Thumbnail upload failed, falling back to full-res thumbnail URL', err)
    }
  }

  return {
    driveFileId: fileId,
    driveFileUrl: uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    driveThumbnailUrl,
  }
}

export async function deleteFromDrive(driveFileId: string): Promise<void> {
  const auth = await getAuth()
  if (!auth) return
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(() => { /* ignore */ })
}
