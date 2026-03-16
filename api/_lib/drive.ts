import { google } from 'googleapis'
import { Readable } from 'stream'

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) return null

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

/**
 * Uploads a file buffer to Google Drive inside the competition's folder.
 * Returns { driveFileId, driveFileUrl, driveThumbnailUrl } or null if Drive is not configured.
 */
export async function uploadToDrive(opts: {
  buffer: Buffer
  filename: string
  mimeType: string
  competitionId: string
  competitionName: string
}): Promise<{ driveFileId: string; driveFileUrl: string; driveThumbnailUrl: string } | null> {
  const auth = getAuth()
  if (!auth) {
    console.log('[Drive] No service account configured — skipping upload')
    return null
  }

  const drive = google.drive({ version: 'v3', auth })
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  // Find or create a subfolder for this competition
  let folderId = rootFolderId ?? 'root'
  if (rootFolderId) {
    const folderSearch = await drive.files.list({
      q: `name = '${opts.competitionName}' and mimeType = 'application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed = false`,
      fields: 'files(id)',
    })
    if (folderSearch.data.files?.[0]?.id) {
      folderId = folderSearch.data.files[0].id
    } else {
      const newFolder = await drive.files.create({
        requestBody: {
          name: opts.competitionName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
        },
        fields: 'id',
      })
      folderId = newFolder.data.id!
    }
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
  })

  const fileId = uploaded.data.id!

  // Make it readable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
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
  await drive.files.delete({ fileId: driveFileId }).catch(() => { /* ignore */ })
}
