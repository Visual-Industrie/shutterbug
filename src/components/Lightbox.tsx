import { useEffect } from 'react'

export function driveImageUrl(fileId: string) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w1920`
}

export default function Lightbox({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none">&times;</button>
      <img src={url} alt={title} className="max-w-full max-h-full object-contain rounded shadow-2xl" onClick={e => e.stopPropagation()} />
      <div className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-sm">{title}</div>
    </div>
  )
}
