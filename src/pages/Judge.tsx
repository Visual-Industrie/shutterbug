import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface Competition {
  id: string
  name: string
  status: string
  judgingClosesAt: string | null
  pointsHonours: number
  pointsHighlyCommended: number
  pointsCommended: number
  pointsAccepted: number
}

interface JudgeInfo {
  id: string
  name: string
}

interface Entry {
  id: string
  type: string
  title: string
  memberNumber: string | null
  driveFileId: string | null
  driveFileUrl: string | null
  driveThumbnailUrl: string | null
  award: string | null
  judgeComment: string | null
  judgedAt: string | null
}

interface PageData {
  competition: Competition
  judge: JudgeInfo
  entries: Entry[]
  scoredCount: number
}

const AWARDS = [
  { value: 'honours', label: 'Honours' },
  { value: 'highly_commended', label: 'Highly Commended' },
  { value: 'commended', label: 'Commended' },
  { value: 'accepted', label: 'Accepted' },
  { value: null, label: 'Not Placed' },
] as const

const AWARD_COLORS: Record<string, string> = {
  honours: 'bg-yellow-500 text-white',
  highly_commended: 'bg-amber-500 text-white',
  commended: 'bg-orange-400 text-white',
  accepted: 'bg-blue-500 text-white',
}

function fmt(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function CommentEditor({
  initialHtml,
  onBlur,
}: {
  initialHtml: string | null
  onBlur: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[80px] focus:outline-none px-3 py-2 text-sm text-gray-700',
      },
    },
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
  })

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Minimal toolbar */}
      <div className="flex gap-1 px-2 py-1 border-b border-gray-100 bg-gray-50">
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}
          className={`px-2 py-0.5 rounded text-xs font-bold ${editor?.isActive('bold') ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-200'}`}
        >B</button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}
          className={`px-2 py-0.5 rounded text-xs italic ${editor?.isActive('italic') ? 'bg-amber-100 text-amber-800' : 'text-gray-500 hover:bg-gray-200'}`}
        >I</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function EntryCard({
  entry,
  onScore,
}: {
  entry: Entry
  onScore: (id: string, award: string | null, comment: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [localAward, setLocalAward] = useState<string | null>(entry.award)
  const commentRef = useRef<string>(entry.judgeComment ?? '')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save(award: string | null, comment: string) {
    setSaving(true)
    setSaved(false)
    await onScore(entry.id, award, comment)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleAwardClick(award: string | null) {
    setLocalAward(award)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => save(award, commentRef.current), 300)
  }

  function handleCommentBlur(html: string) {
    commentRef.current = html
    save(localAward, html)
  }

  return (
    <div className={`bg-white rounded-xl border-2 transition-colors ${entry.judgedAt ? 'border-green-200' : 'border-gray-200'}`}>
      {/* Image */}
      <div className="relative">
        {entry.driveThumbnailUrl ? (
          <img
            src={entry.driveThumbnailUrl}
            alt={entry.title}
            onClick={() => entry.driveFileUrl && window.open(entry.driveFileUrl, '_blank')}
            className={`w-full h-48 object-cover rounded-t-xl ${entry.driveFileUrl ? 'cursor-zoom-in' : ''}`}
          />
        ) : (
          <div className="w-full h-48 bg-gray-100 rounded-t-xl flex items-center justify-center text-gray-300 text-4xl">
            📷
          </div>
        )}

        {/* Type badge */}
        <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
          {entry.type.toUpperCase()}
        </span>

        {/* Scored indicator */}
        {entry.judgedAt && (
          <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-medium px-2 py-0.5 rounded">
            ✓ Scored
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Title + member# */}
        <div>
          <div className="font-semibold text-gray-900 text-sm">
            {entry.title}
            {entry.memberNumber && <span className="text-gray-400 font-normal ml-1">(#{entry.memberNumber})</span>}
          </div>
        </div>

        {/* Award buttons */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">Award</div>
          <div className="flex flex-wrap gap-1.5">
            {AWARDS.map(({ value, label }) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => handleAwardClick(value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  localAward === value
                    ? (value ? (AWARD_COLORS[value] ?? 'bg-gray-500 text-white') : 'bg-gray-500 text-white') + ' border-transparent'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">Comment</div>
          <CommentEditor
            initialHtml={entry.judgeComment}
            onBlur={handleCommentBlur}
          />
        </div>

        {/* Save status */}
        <div className="h-4 text-right">
          {saving && <span className="text-xs text-gray-400">Saving…</span>}
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
      </div>
    </div>
  )
}

export default function Judge() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [completeMsg, setCompleteMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [filter, setFilter] = useState<'all' | 'projim' | 'printim' | 'unscored'>('all')

  async function load() {
    const res = await fetch(`/api/judge/${token}`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Invalid or expired judging link')
      setLoading(false)
      return
    }
    const d: PageData = await res.json()
    setData(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  const handleScore = useCallback(async (entryId: string, award: string | null, comment: string) => {
    await fetch(`/api/judge/${token}/score`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, award, comment }),
    })
    // Update local state so scoredCount stays in sync
    setData(prev => {
      if (!prev) return prev
      const entries = prev.entries.map(e =>
        e.id === entryId ? { ...e, award, judgeComment: comment, judgedAt: new Date().toISOString() } : e,
      )
      return { ...prev, entries, scoredCount: entries.filter(e => e.judgedAt !== null).length }
    })
  }, [token])

  async function handleComplete() {
    setCompleting(true)
    setCompleteMsg(null)
    const res = await fetch(`/api/judge/${token}/complete`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setCompleteMsg({ text: json.error ?? 'Could not complete judging', ok: false })
    } else {
      setCompleteMsg({ text: 'Judging complete! Thank you.', ok: true })
      await load()
    }
    setCompleting(false)
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

  const { competition: comp, judge, entries, scoredCount } = data
  const isComplete = comp.status === 'complete'
  const total = entries.length
  const pct = total > 0 ? Math.round((scoredCount / total) * 100) : 0

  const filtered = entries
    .filter(e => {
      if (filter === 'projim') return e.type === 'projim'
      if (filter === 'printim') return e.type === 'printim'
      if (filter === 'unscored') return !e.judgedAt
      return true
    })
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'printim' ? -1 : 1))

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">
              Wairarapa Camera Club · Judging
            </div>
            <h1 className="text-lg font-bold text-gray-900">{comp.name}</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Judging for {judge.name}
              {comp.judgingClosesAt && <> · Due {fmt(comp.judgingClosesAt)}</>}
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-4 shrink-0">
            <Link
              to={`/judge/${token}/reference`}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Reference view
            </Link>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">{scoredCount}/{total} scored</div>
              <div className="mt-1 w-32 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Status messages */}
        {isComplete && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <p className="text-sm font-semibold text-green-800">Judging is complete</p>
            <p className="text-xs text-green-600 mt-0.5">All scores have been submitted and points recorded. Thank you!</p>
          </div>
        )}

        {completeMsg && (
          <div className={`mb-6 px-5 py-4 rounded-xl text-sm ${completeMsg.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
            {completeMsg.text}
          </div>
        )}

        {/* Filter + Complete button */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {(['all', 'projim', 'printim', 'unscored'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  filter === f ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f === 'all' ? `All (${total})` : f === 'unscored' ? `Unscored (${total - scoredCount})` : f.toUpperCase()}
              </button>
            ))}
          </div>

          {!isComplete && (
            <button
              onClick={handleComplete}
              disabled={completing || scoredCount < total}
              className="px-5 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={scoredCount < total ? `Score all entries before completing (${total - scoredCount} remaining)` : ''}
            >
              {completing ? 'Submitting…' : 'Complete judging'}
            </button>
          )}
        </div>

        {/* Entry grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No entries to show</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(entry => (
              <EntryCard key={entry.id} entry={entry} onScore={handleScore} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
