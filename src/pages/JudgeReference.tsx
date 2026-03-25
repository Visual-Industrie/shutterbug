import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

interface Competition {
  id: string
  name: string
  status: string
  judgingOpensAt: string | null
}

interface ReferenceEntry {
  id: string
  type: string
  title: string
  drive_file_url: string | null
  drive_thumbnail_url: string | null
  sort_order: number | null
  award: string | null
  judge_comment: string | null
  judged_at: string | null
  first_name: string
  last_name: string
  membership_number: string | null
}

const AWARD_LABEL: Record<string, string> = {
  honours: 'Honours',
  highly_commended: 'Highly Commended',
  commended: 'Commended',
  accepted: 'Accepted',
  winner: 'Winner',
  shortlisted: 'Shortlisted',
}

const AWARD_COLORS: Record<string, string> = {
  honours: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  highly_commended: 'bg-amber-100 text-amber-800 border-amber-300',
  commended: 'bg-orange-100 text-orange-800 border-orange-300',
  accepted: 'bg-blue-100 text-blue-800 border-blue-300',
  winner: 'bg-purple-100 text-purple-800 border-purple-300',
  shortlisted: 'bg-gray-100 text-gray-700 border-gray-300',
}

interface PageData {
  competition: Competition
  entries: ReferenceEntry[]
  reorderLocked: boolean
}

function fmt(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function JudgeReference() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [entries, setEntries] = useState<ReferenceEntry[]>([])
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null)

  const closeLightbox = useCallback(() => setLightbox(null), [])

  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, closeLightbox])

  async function load() {
    const res = await fetch(`/api/judge/${token}/reference`)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Invalid or expired judging link')
      setLoading(false)
      return
    }
    const d: PageData = await res.json()
    setData(d)
    setEntries(d.entries)
    setLoading(false)
  }

  useEffect(() => { load() }, [token])

  async function move(index: number, direction: 'up' | 'down') {
    const newEntries = [...entries]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newEntries.length) return
    ;[newEntries[index], newEntries[swapIndex]] = [newEntries[swapIndex], newEntries[index]]
    setEntries(newEntries)

    setSaving(true)
    setSaveMsg(null)
    try {
      const payload = newEntries.map((e, i) => ({ id: e.id, sort_order: i + 1 }))
      const res = await fetch(`/api/judge/${token}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: payload }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setSaveMsg(j.error ?? 'Failed to save order')
        // revert
        setEntries(entries)
      } else {
        setSaveMsg('Order saved')
        setTimeout(() => setSaveMsg(null), 2000)
      }
    } catch {
      setSaveMsg('Failed to save order')
      setEntries(entries)
    } finally {
      setSaving(false)
    }
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

  const { competition: comp, reorderLocked } = data
  const projimEntries = entries.filter(e => e.type === 'projim')
  const printimEntries = entries.filter(e => e.type === 'printim')

  function EntryCard({ entry, globalIdx }: { entry: ReferenceEntry; globalIdx: number }) {
    return (
      <div className="entry-card bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col md:flex-row">
        {/* Left: image + meta */}
        <div className="print-left md:w-64 md:shrink-0 flex flex-col">
          <div className="relative">
            {entry.drive_thumbnail_url ? (
              <img
                src={entry.drive_thumbnail_url}
                alt={entry.title}
                onClick={() => entry.drive_file_url && setLightbox({ url: entry.drive_file_url, title: entry.title })}
                className={`w-full h-48 md:h-52 object-cover ${entry.drive_file_url ? 'cursor-zoom-in' : ''}`}
              />
            ) : (
              <div className="w-full h-48 md:h-52 bg-gray-100 flex items-center justify-center text-gray-300 text-4xl">📷</div>
            )}
            <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
              {entry.type.toUpperCase()}
            </span>
            <span className="absolute top-2 right-2 bg-white/90 text-gray-700 text-xs font-bold px-2 py-0.5 rounded">
              #{globalIdx + 1}
            </span>
          </div>
          <div className="p-3 flex-1 flex flex-col gap-2">
            <div className="font-semibold text-gray-900 text-sm">
              {entry.title}
              {entry.membership_number && <span className="text-gray-400 font-normal ml-1">(#{entry.membership_number})</span>}
            </div>
            {entry.award && (
              <div className={`inline-flex self-start px-2 py-0.5 rounded border text-xs font-semibold ${AWARD_COLORS[entry.award] ?? 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                {AWARD_LABEL[entry.award] ?? entry.award}
              </div>
            )}
            {!reorderLocked && (
              <div className="flex gap-1 no-print">
                <button onClick={() => move(globalIdx, 'up')} disabled={saving || globalIdx === 0}
                  className="px-2 py-0.5 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-30">↑</button>
                <button onClick={() => move(globalIdx, 'down')} disabled={saving || globalIdx === entries.length - 1}
                  className="px-2 py-0.5 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-30">↓</button>
              </div>
            )}
          </div>
        </div>

        {/* Right: comment */}
        {entry.judge_comment && (
          <div className="print-right flex-1 p-4 md:border-l border-t md:border-t-0 border-gray-100">
            <div
              className="text-sm text-gray-600 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: entry.judge_comment }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 no-print" onClick={closeLightbox}>
          <button onClick={closeLightbox} className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none">&times;</button>
          <img
            src={lightbox.url}
            alt={lightbox.title}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-sm">{lightbox.title}</div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .entry-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #ccc !important; margin-bottom: 12px; display: flex !important; flex-direction: row !important; }
          .entry-card .print-left { width: 25% !important; flex-shrink: 0; }
          .entry-card .print-left img { width: 100% !important; height: auto !important; max-height: none !important; }
          .entry-card .print-right { width: 75% !important; }
          .print-section-break { break-before: page; page-break-before: always; }
          @page { margin: 1.5cm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 10pt; color: #666; } }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 no-print">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">
              Wairarapa Camera Club · Judging Reference
            </div>
            <h1 className="text-lg font-bold text-gray-900">{comp.name}</h1>
            {comp.judgingOpensAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                {reorderLocked
                  ? <span className="text-orange-600 font-medium">Order locked — judging is open</span>
                  : <>Reorder available until {fmt(comp.judgingOpensAt)}</>
                }
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-xs ${saveMsg === 'Order saved' ? 'text-green-600' : 'text-red-600'}`}>
                {saveMsg}
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Print
            </button>
            <Link
              to={`/judge/${token}`}
              className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              ← Back to scoring
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <p className="text-sm text-gray-500 mb-6 no-print">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} total
          {!reorderLocked && ' · Drag into running order using the arrows'}
        </p>

        {/* PROJIM entries */}
        {projimEntries.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Projected Images ({projimEntries.length})
            </h2>
            <div className="flex flex-col gap-4">
              {entries.map((entry, globalIdx) => entry.type !== 'projim' ? null : (
                <EntryCard key={entry.id} entry={entry} globalIdx={globalIdx} />
              ))}
            </div>
          </section>
        )}

        {/* PRINTIM entries */}
        {printimEntries.length > 0 && (
          <section className={projimEntries.length > 0 ? 'print-section-break' : ''}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Printed Images ({printimEntries.length})
            </h2>
            <div className="flex flex-col gap-4">
              {entries.map((entry, globalIdx) => entry.type !== 'printim' ? null : (
                <EntryCard key={entry.id} entry={entry} globalIdx={globalIdx} />
              ))}
            </div>
          </section>
        )}

        {entries.length === 0 && (
          <div className="text-center py-16 text-gray-400">No entries for this competition</div>
        )}
      </div>
    </div>
  )
}
