import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

interface Competition {
  id: string
  name: string
  status: string
  closes_at: string | null
  max_projim_entries: number
  max_printim_entries: number
}

interface Member {
  id: string
  first_name: string
  last_name: string
  membership_number: string | null
}

interface Entry {
  id: string
  type: string
  title: string
  drive_file_url: string | null
  drive_thumbnail_url: string | null
  submitted_at: string
}

interface PageData {
  competition: Competition
  member: Member
  entries: Entry[]
  projimCount: number
  printimCount: number
}

const TYPE_LABEL: Record<string, string> = { projim: 'PROJIM', printim: 'PRINTIM' }

function fmt(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Submit() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Upload form state
  const [type, setType] = useState<'projim' | 'printim'>('projim')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const res = await fetch(`/api/submit/${token}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Invalid or expired link')
      setLoading(false)
      return
    }
    const d: PageData = await res.json()
    setData(d)
    // Default to projim if they still have a slot, otherwise printim
    if (d.projimCount < d.competition.max_projim_entries) setType('projim')
    else setType('printim')
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setUploadMsg({ text: 'Please enter a title', ok: false }); return }
    setUploading(true)
    setUploadMsg(null)

    try {
      // Step 1: get resumable upload URL from Vercel
      setUploadStatus('Preparing upload…')
      const sessionRes = await fetch(`/api/submit/${token}/entries/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title }),
      })
      const sessionJson = await sessionRes.json()
      if (!sessionRes.ok) {
        setUploadMsg({ text: sessionJson.error ?? 'Upload failed', ok: false })
        return
      }
      const { uploadUrl } = sessionJson as { uploadUrl: string }

      // Step 2: upload directly to Google Drive (Vercel not in the path)
      setUploadStatus('Uploading…')
      const driveRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file?.type ?? 'image/jpeg' },
        body: file ?? undefined,
      })
      if (!driveRes.ok) {
        setUploadMsg({ text: 'Upload to Drive failed', ok: false })
        return
      }
      const driveJson = await driveRes.json()
      const driveFileId: string = driveJson.id

      // Step 3: process + finalize via Vercel
      setUploadStatus('Processing…')
      const finalRes = await fetch(`/api/submit/${token}/entries/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId, type, title }),
      })
      const finalJson = await finalRes.json()
      if (!finalRes.ok) {
        setUploadMsg({ text: finalJson.error ?? 'Processing failed', ok: false })
        return
      }

      setUploadMsg({ text: 'Entry submitted!', ok: true })
      setTitle('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch {
      setUploadMsg({ text: 'An unexpected error occurred', ok: false })
    } finally {
      setUploading(false)
      setUploadStatus('')
    }
  }

  async function handleDelete(entryId: string) {
    if (!confirm('Remove this entry?')) return
    const res = await fetch(`/api/submit/${token}/entries?entryId=${entryId}`, { method: 'DELETE' })
    if (res.ok) await load()
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Loading…</div>
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link not valid</h1>
        <p className="text-gray-500 text-sm">{error ?? 'This link is invalid or has expired.'}</p>
      </div>
    </div>
  )

  const { competition: comp, member, entries, projimCount, printimCount } = data
  const isClosed = comp.status !== 'open'
  const projimFull = projimCount >= comp.max_projim_entries
  const printimFull = printimCount >= comp.max_printim_entries
  const canSubmit = !isClosed && (!projimFull || !printimFull)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Wairarapa Camera Club</div>
          <h1 className="text-xl font-bold text-gray-900">{comp.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isClosed
              ? <span className="text-orange-600 font-medium">Submissions are closed</span>
              : comp.closes_at
                ? <>Closes <span className="font-medium">{fmt(comp.closes_at)}</span></>
                : 'Open for submissions'
            }
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-sm text-amber-900">
            Welcome, <span className="font-semibold">{member.first_name} {member.last_name}</span>
            {member.membership_number && <span className="text-amber-700 ml-1">(#{member.membership_number})</span>}
          </p>
          <p className="text-xs text-amber-700 mt-1">
            {projimCount}/{comp.max_projim_entries} PROJIM · {printimCount}/{comp.max_printim_entries} PRINTIM submitted
          </p>
        </div>

        {/* Existing entries */}
        {entries.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Your entries</h2>
            <div className="space-y-2">
              {entries.map(e => (
                <div key={e.id} className="bg-white rounded-xl border border-gray-200 flex items-center gap-4 p-3">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    {e.drive_thumbnail_url ? (
                      <img src={e.drive_thumbnail_url} alt={e.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📷</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{e.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{TYPE_LABEL[e.type]}</div>
                  </div>

                  {e.drive_file_url && (
                    <a
                      href={e.drive_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-amber-700 hover:underline shrink-0"
                    >
                      View
                    </a>
                  )}

                  {!isClosed && (
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload form */}
        {canSubmit && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Add an entry</h2>

            {uploadMsg && (
              <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${uploadMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {uploadMsg.text}
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-4">
              {/* Entry type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Entry type</label>
                <div className="flex gap-2">
                  {(['projim', 'printim'] as const).map(t => {
                    const full = t === 'projim' ? projimFull : printimFull
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={full}
                        onClick={() => setType(t)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          type === t && !full
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {TYPE_LABEL[t]}
                        {full && ' (full)'}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Title <span className="text-gray-400">(as you'd like it displayed)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Golden Hour at the Wharf"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              {/* File */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Image file <span className="text-gray-400">(JPEG or PNG, max 50 MB)</span>
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                />
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {uploading ? (uploadStatus || 'Uploading…') : 'Submit entry'}
              </button>
            </form>
          </div>
        )}

        {/* All full */}
        {!isClosed && !canSubmit && entries.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-sm text-green-800">
            You've submitted the maximum number of entries for this competition. Good luck!
          </div>
        )}

        {/* Closed notice */}
        {isClosed && entries.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">🔒</div>
            <p>This competition is no longer accepting submissions.</p>
          </div>
        )}
      </div>
    </div>
  )
}
