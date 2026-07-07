import { useEffect, useRef, useState } from 'react'
import { compressImage } from '@/lib/image'

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

/**
 * Reusable member submission UI for a single competition, keyed by a submission
 * token. Fetches its own data from /api/submit/:token and drives the existing
 * upload/delete machinery. Used both by the standalone /submit page and (once per
 * open competition) by the member portal.
 *
 * - `showWelcome` renders the greeting box (standalone submit page only — the
 *   portal greets the member once at the top).
 */
export default function MemberSubmissionForm({ token, showWelcome = false }: { token: string; showWelcome?: boolean }) {
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState<'projim' | 'printim'>('projim')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadMsg, setUploadMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  async function validateFile(f: File): Promise<string | null> {
    if (f.size > 4 * 1024 * 1024) {
      return `File is ${(f.size / 1024 / 1024).toFixed(1)} MB — maximum allowed is 4 MB`
    }
    return new Promise(resolve => {
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const longest = Math.max(img.naturalWidth, img.naturalHeight)
        if (longest > 1920) {
          resolve(`Image is ${img.naturalWidth}×${img.naturalHeight}px — longest edge must be 1920px or less`)
        } else {
          resolve(null)
        }
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve('Could not read image — please try another file') }
      img.src = url
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setFileError(null)
    if (f) {
      const err = await validateFile(f)
      setFileError(err)
    }
  }

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
    if (d.projimCount < d.competition.max_projim_entries) setType('projim')
    else setType('printim')
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setUploadMsg({ text: 'Please enter a title', ok: false }); return }
    if (fileError) return
    setUploading(true)
    setUploadMsg(null)

    try {
      if (!file) {
        setUploadMsg({ text: 'Please select an image', ok: false })
        return
      }

      const validationErr = await validateFile(file)
      if (validationErr) { setFileError(validationErr); setUploading(false); return }

      setUploadStatus('Preparing image…')
      const compressed = await compressImage(file)

      setUploadStatus('Uploading…')
      const form = new FormData()
      form.append('type', type)
      form.append('title', title)
      form.append('file', compressed, file.name)

      const res = await fetch(`/api/submit/${token}/entries/upload`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (!res.ok) { setUploadMsg({ text: json.error ?? 'Upload failed', ok: false }); return }

      setUploadMsg({ text: 'Entry submitted!', ok: true })
      setTitle('')
      setFile(null)
      setFileError(null)
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

  if (loading) return <div className="text-gray-400 text-sm py-4">Loading…</div>

  if (error || !data) return (
    <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
      {error ?? 'This competition could not be loaded.'}
    </div>
  )

  const { competition: comp, member, entries, projimCount, printimCount } = data
  const isClosed = comp.status !== 'open'
  const projimFull = projimCount >= comp.max_projim_entries
  const printimFull = printimCount >= comp.max_printim_entries
  const canSubmit = !isClosed && (!projimFull || !printimFull)

  return (
    <div className="space-y-4">
      {/* Competition heading */}
      <div>
        <h2 className="text-lg font-bold text-gray-900">{comp.name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {isClosed
            ? <span className="text-orange-600 font-medium">Submissions are closed</span>
            : comp.closes_at
              ? <>Closes <span className="font-medium">{fmt(comp.closes_at)}</span></>
              : 'Open for submissions'
          }
          <span className="text-gray-400"> · {projimCount}/{comp.max_projim_entries} PROJIM · {printimCount}/{comp.max_printim_entries} PRINTIM</span>
        </p>
      </div>

      {showWelcome && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-sm text-amber-900">
            Welcome, <span className="font-semibold">{member.first_name} {member.last_name}</span>
            {member.membership_number && <span className="text-amber-700 ml-1">(#{member.membership_number})</span>}
          </p>
        </div>
      )}

      {/* Existing entries */}
      {entries.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Your entries</h3>
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 flex items-center gap-4 p-3">
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
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Add an entry</h3>

          {uploadMsg && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${uploadMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {uploadMsg.text}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-4">
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

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Image file <span className="text-gray-400">(JPEG or PNG, max 4 MB, longest edge max 1920px)</span>
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
              />
              {fileError && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {fileError}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !!fileError}
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
        <div className="text-center py-8 text-gray-400 text-sm">
          This competition is no longer accepting submissions.
        </div>
      )}
    </div>
  )
}
