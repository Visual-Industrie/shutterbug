import { google } from 'googleapis'
import { Readable } from 'stream'

function getAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null

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
  const auth = getAuth()
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
}): Promise<{ driveFileUrl: string; driveThumbnailUrl: string }> {
  const auth = getAuth()
  if (!auth) throw new Error('Drive not configured')

  const drive = google.drive({ version: 'v3', auth })
  const stream = Readable.from(opts.processedBuffer)

  const updated = await drive.files.update({
    fileId: opts.driveFileId,
    requestBody: { name: opts.filename },
    media: { mimeType: 'image/jpeg', body: stream },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })

  await drive.permissions.create({
    fileId: opts.driveFileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  return {
    driveFileUrl: updated.data.webViewLink ?? `https://drive.google.com/file/d/${opts.driveFileId}/view`,
    driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${opts.driveFileId}&sz=w400`,
  }
}

/** Downloads a file from Drive into memory and returns a Buffer. */
export async function downloadFromDrive(driveFileId: string): Promise<Buffer> {
  const auth = getAuth()
  if (!auth) throw new Error('Drive not configured')

  const drive = google.drive({ version: 'v3', auth })
  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true } as Parameters<typeof drive.files.get>[0],
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

export async function uploadToDrive(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
  competitionId: string
  competitionName: string
  judgingClosesAt?: string | null
}): Promise<{ driveFileId: string; driveFileUrl: string; driveThumbnailUrl: string } | null> {
  const auth = getAuth()
  if (!auth) {
    console.log('[Drive] No service account configured — skipping upload')
    return null
  }

  const drive = google.drive({ version: 'v3', auth })
  const folderId = await ensureFolderPath(drive, opts.competitionName, opts.judgingClosesAt)

  // Upload the file
  const stream = new Readable()
  stream.push(opts.buffer)
  stream.push(null)

  const uploaded = await drive.files.create({
    requestBody: {
      name: opts.filename,
      parents: [folderId],
    },
    media: { mimeType: opts.mimeType, body: stream },
    fields: 'id,webViewLink',
    supportsAllDrives: true,
  })

  const fileId = uploaded.data.id!

  // Make it readable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  return {
    driveFileId: fileId,
    driveFileUrl: uploaded.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
    driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
  }
}

export async function deleteFromDrive(driveFileId: string): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  const drive = google.drive({ version: 'v3', auth })
  await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(() => { /* ignore */ })
}
