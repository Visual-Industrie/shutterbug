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

/**
 * Uploads a file buffer to Google Drive inside the competition's folder.
 * Returns { driveFileId, driveFileUrl, driveThumbnailUrl } or null if Drive is not configured.
 */
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
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // Build folder path: Root > YYYY > MM - Competition Name
  let folderId = rootFolderId ?? 'root'
  if (rootFolderId) {
    const date = opts.judgingClosesAt ? new Date(opts.judgingClosesAt) : new Date()
    const year = String(date.getUTCFullYear())
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const competitionFolder = `${month} - ${opts.competitionName}`

    const yearFolderId = await ensureFolder(drive, year, rootFolderId)
    folderId = await ensureFolder(drive, competitionFolder, yearFolderId)
  }

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
