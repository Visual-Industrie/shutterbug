const VERCEL_BODY_LIMIT = 50 * 1024 * 1024 // 50MB

// Only compresses if the file exceeds Vercel's body limit.
// The server re-processes with Sharp regardless; this is just for transport.
export async function compressImage(file: File): Promise<Blob> {
  if (file.size <= VERCEL_BODY_LIMIT) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const MAX_DIM = 2400
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = MAX_DIM / Math.max(width, height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      const tryQuality = (q: number) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          if (blob.size <= VERCEL_BODY_LIMIT || q <= 0.5) resolve(blob)
          else tryQuality(Math.round((q - 0.1) * 10) / 10)
        }, 'image/jpeg', q)
      }
      tryQuality(0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
