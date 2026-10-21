import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { formatNzDate } from '@/lib/dates'
import type {
  AvailabilityCompetition,
  AvailabilityPageData,
  JudgeAvailabilityResponse,
} from '@/types/judge-availability'

const OPTIONS: Array<{ value: JudgeAvailabilityResponse; title: string; submit: string }> = [
  { value: 'keen', title: 'I’d love to judge — I’ll make my selections in order of preference below.', submit: 'Send my preferences' },
  { value: 'not_this_year', title: 'I can’t do any of these, but please consider me in future years.', submit: 'Send response' },
  { value: 'remove', title: 'Please remove me from the list.', submit: 'Remove me' },
]

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function CompDates({ c }: { c: AvailabilityCompetition }) {
  return (
    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {c.closesAt && <span>Entries close <strong className="text-gray-700 font-medium">{formatNzDate(c.closesAt)}</strong></span>}
      <span>Judging / club night <strong className="text-gray-700 font-medium">{formatNzDate(c.judgingClosesAt)}</strong></span>
    </div>
  )
}

function SortableRow({
  comp, index, total, onMove, onRemove,
}: {
  comp: AvailabilityCompetition
  index: number
  total: number
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: comp.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-white border rounded-xl px-2 py-2.5 ${isDragging ? 'border-amber-400 shadow-lg z-10 relative' : 'border-gray-200'}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${comp.name}`}
        className="touch-none cursor-grab active:cursor-grabbing px-1.5 py-2 text-gray-300 hover:text-gray-500"
      >
        <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true">
          {[3, 10, 17].map(y => <g key={y}><circle cx="4" cy={y} r="1.6" /><circle cx="10" cy={y} r="1.6" /></g>)}
        </svg>
      </button>
      <span className="w-7 h-7 shrink-0 rounded-full bg-amber-100 text-amber-800 text-sm font-semibold flex items-center justify-center">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{comp.name}</div>
        <div className="text-xs text-gray-400 truncate">Judging {formatNzDate(comp.judgingClosesAt)}</div>
      </div>
      <div className="flex flex-col sm:flex-row gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onMove(index, index - 1)}
          disabled={index === 0}
          aria-label={`Move ${comp.name} up`}
          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
        >↑</button>
        <button
          type="button"
          onClick={() => onMove(index, index + 1)}
          disabled={index === total - 1}
          aria-label={`Move ${comp.name} down`}
          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"
        >↓</button>
      </div>
      <button
        type="button"
        onClick={() => onRemove(comp.id)}
        aria-label={`Remove ${comp.name}`}
        className="w-8 h-8 shrink-0 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none"
      >×</button>
    </li>
  )
}

function Summary({ data }: { data: AvailabilityPageData }) {
  const byId = new Map(data.competitions.map(c => [c.id, c]))
  const { response, preferences } = data.current
  if (response === 'keen') {
    return (
      <div>
        <p className="text-sm text-gray-700 mb-3">You’d like to judge these, in order of preference:</p>
        <ol className="space-y-2">
          {preferences.map((id, i) => {
            const c = byId.get(id)
            if (!c) return null
            return (
              <li key={id} className="flex gap-3 items-start">
                <span className="w-6 h-6 shrink-0 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold flex items-center justify-center mt-0.5">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {c.name}
                    {c.filled && <span className="ml-2 text-xs font-normal text-gray-400">Judge confirmed</span>}
                  </div>
                  <CompDates c={c} />
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }
  if (response === 'not_this_year') {
    return <p className="text-sm text-gray-700">You can’t judge this season, but you’d like to stay on our list for future years.</p>
  }
  if (response === 'remove') {
    return <p className="text-sm text-gray-700">You’ve asked to be removed from our judges list.</p>
  }
  return <p className="text-sm text-gray-500">No response recorded.</p>
}

export default function JudgeAvailability() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<AvailabilityPageData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<'form' | 'done'>('form')
  const [choice, setChoice] = useState<JudgeAvailabilityResponse | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function applyData(d: AvailabilityPageData, initial: boolean) {
    setData(d)
    if (initial) {
      setChoice(d.current.response)
      // Drop picks that have been filled since — they can't be kept.
      const open = new Set(d.competitions.filter(c => !c.filled).map(c => c.id))
      setSelected(d.current.preferences.filter(id => open.has(id)))
      setMode(d.current.response ? 'done' : 'form')
    }
  }

  async function load(initial: boolean) {
    try {
      const res = await fetch(`/api/public/judge-availability/${token}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'This link isn’t valid')
      applyData(body as AvailabilityPageData, initial)
      return body as AvailabilityPageData
    } catch (err) {
      if (initial) setLoadError(err instanceof Error ? err.message : 'This link isn’t valid')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(true) }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const compById = useMemo(() => new Map((data?.competitions ?? []).map(c => [c.id, c])), [data])

  function toggle(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function move(from: number, to: number) {
    setSelected(prev => (to < 0 || to >= prev.length ? prev : arrayMove(prev, from, to)))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setSelected(prev => arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id))))
  }

  async function submit() {
    if (!choice) return
    if (choice === 'remove' && !confirmRemove) { setConfirmRemove(true); return }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/public/judge-availability/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: choice, preferences: choice === 'keen' ? selected : [] }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && body.error === 'all_selected_filled') {
        setSaveError('Sorry — the competitions you picked have just been filled. Please choose again.')
        const fresh = await load(false)
        if (fresh) {
          const open = new Set(fresh.competitions.filter(c => !c.filled).map(c => c.id))
          setSelected(prev => prev.filter(id => open.has(id)))
        }
        return
      }
      if (res.status === 410) {
        setSaveError('Responses have now closed. Please contact the club if anything has changed.')
        await load(false)
        return
      }
      if (!res.ok) throw new Error(body.error ?? 'Something went wrong — please try again')
      applyData(body as AvailabilityPageData, true)
      setConfirmRemove(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setSaving(false)
    }
  }

  // ── States ──
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError || !data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link not valid</h1>
        <p className="text-gray-500 text-sm">This link isn’t valid. Please contact the club.</p>
      </div>
    </div>
  )

  const deadline = formatNzDate(data.deadline)
  const available = data.competitions.filter(c => !c.filled)
  const filledPicks = data.competitions.filter(c => c.filled)
  const option = OPTIONS.find(o => o.value === choice)
  const canSubmit = !!choice && !saving && (choice !== 'keen' || selected.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
            Wairarapa Camera Club · Judges
          </div>
          <h1 className="text-xl font-bold text-gray-900">Kia ora {data.judge.firstName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Judging for the {data.season.year} season
            {data.deadline && !data.readOnly && <> · Please respond by <strong className="text-gray-700">{deadline}</strong></>}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            You’re currently listed as
            <span className={`px-2 py-0.5 rounded font-medium ${data.judge.archived ? 'bg-red-50 text-red-600' : data.judge.isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {data.judge.archived ? 'Removed' : data.judge.isAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 pb-28">
        {/* ── Read-only (after the deadline) ── */}
        {data.readOnly && (
          <div className="space-y-4">
            <div className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
              Responses closed on {deadline}. Please contact the club if anything has changed.
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5"><Summary data={data} /></div>
          </div>
        )}

        {/* ── Saved ── */}
        {!data.readOnly && mode === 'done' && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-green-800">Thanks — your response is saved</p>
              <p className="text-xs text-green-700 mt-0.5">
                We’ve emailed you a copy. You can change this any time before {deadline}.
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5"><Summary data={data} /></div>
            <button
              type="button"
              onClick={() => { setMode('form'); setSaveError(null) }}
              className="w-full sm:w-auto px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-white"
            >
              Edit response
            </button>
          </div>
        )}

        {/* ── Form ── */}
        {!data.readOnly && mode === 'form' && (
          <div className="space-y-6">
            <p className="text-sm text-gray-600">
              Would you like to stay on our judges list, and which (if any) of our {data.season.year} competitions would you be interested in judging?
            </p>

            <fieldset className="space-y-3">
              <legend className="sr-only">Your response</legend>
              {OPTIONS.map(o => (
                <label
                  key={o.value}
                  className={`flex gap-3 items-start p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    choice === o.value ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="response"
                    value={o.value}
                    checked={choice === o.value}
                    onChange={() => { setChoice(o.value); setConfirmRemove(false) }}
                    className="mt-0.5 w-5 h-5 accent-amber-600 shrink-0"
                  />
                  <span className="text-sm font-medium text-gray-900">{o.title}</span>
                </label>
              ))}
            </fieldset>

            {choice === 'keen' && (
              <>
                <section>
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">Competitions needing a judge</h2>
                  <p className="text-xs text-gray-500 mb-3">Tick any you’d be interested in judging. As many as you like.</p>
                  {available.length === 0 ? (
                    <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-xl p-4">
                      Every competition now has a judge. You could choose the second option instead.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {available.map(c => {
                        const rank = selected.indexOf(c.id)
                        return (
                          <label
                            key={c.id}
                            className={`flex gap-3 items-start p-4 rounded-xl border cursor-pointer transition-colors ${
                              rank >= 0 ? 'border-amber-400 bg-white ring-1 ring-amber-200' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={rank >= 0}
                              onChange={() => toggle(c.id)}
                              className="mt-0.5 w-5 h-5 accent-amber-600 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                                {rank >= 0 && <span className="text-xs text-amber-700 font-medium shrink-0">{ordinal(rank + 1)} choice</span>}
                              </div>
                              <CompDates c={c} />
                              {c.description && (
                                <div
                                  className="mt-2 text-xs text-gray-600 [&_p]:mb-1 [&_a]:text-amber-700 [&_a]:underline"
                                  dangerouslySetInnerHTML={{ __html: c.description }}
                                />
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {filledPicks.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {filledPicks.map(c => (
                        <div key={c.id} className="flex gap-3 items-start p-4 rounded-xl border border-gray-200 bg-gray-50 opacity-60">
                          <input type="checkbox" disabled className="mt-0.5 w-5 h-5 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold text-gray-700">{c.name} <span className="ml-1 text-xs font-normal">Judge confirmed</span></div>
                            <CompDates c={c} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {selected.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-gray-900 mb-1">Your preferences</h2>
                    <p className="text-xs text-gray-500 mb-3">
                      Drag the handle, or use the arrows, to put your first choice at the top.
                    </p>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={selected} strategy={verticalListSortingStrategy}>
                        <ol className="space-y-2">
                          {selected.map((id, i) => {
                            const c = compById.get(id)
                            if (!c) return null
                            return (
                              <SortableRow key={id} comp={c} index={i} total={selected.length} onMove={move} onRemove={toggle} />
                            )
                          })}
                        </ol>
                      </SortableContext>
                    </DndContext>
                  </section>
                )}
              </>
            )}

            {choice === 'remove' && confirmRemove && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
                Are you sure? We’ll take you off our judges list. You can undo this using this link before {deadline}.
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{saveError}</div>
            )}
          </div>
        )}
      </main>

      {/* Sticky submit bar */}
      {!data.readOnly && mode === 'form' && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-gray-200">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <div className="flex-1 text-xs text-gray-500">
              {!choice && 'Choose one of the options above'}
              {choice === 'keen' && (selected.length === 0 ? 'Select at least one competition' : `${selected.length} selected`)}
            </div>
            {data.current.response && (
              <button
                type="button"
                onClick={() => { applyData(data, true) }}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={`px-5 py-2.5 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                choice === 'remove' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {saving ? 'Saving…' : choice === 'remove' && confirmRemove ? 'Yes, remove me' : option?.submit ?? 'Send response'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
