import sharp from 'sharp'
import * as path from 'path'

const MAX_LONG_EDGE = 1920

/**
 * Processes an uploaded image:
 * - Strips all EXIF/metadata
 * - Resizes so the long edge is at most 1920px (no upscaling)
 * - Returns a JPEG buffer regardless of input format
 */
export async function processImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(MAX_LONG_EDGE, MAX_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .withMetadata({}) // passing empty object strips all metadata
    .toBuffer()
}

/**
 * Builds the canonical filename for a competition entry.
 * Format: TYPE-EntryName-MembershipNumber.jpg
 * e.g. PROJIM-Golden-Hour-at-the-Wharf-472.jpg
 */
export function buildEntryFilename(opts: {
  type: 'projim' | 'printim'
  title: string
  membershipNumber: string | null
  originalFilename: string
}): string {
  const ext = path.extname(opts.originalFilename).toLowerCase() || '.jpg'
  const safeName = opts.title
    .trim()
    .replace(/[^a-zA-Z0-9 ]/g, '')  // strip special chars
    .replace(/\s+/g, '-')            // spaces to hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .slice(0, 80)                    // cap length

  const memberId = opts.membershipNumber ?? 'unknown'
  return `${opts.type.toUpperCase()}-${safeName}-${memberId}${ext}`
}
