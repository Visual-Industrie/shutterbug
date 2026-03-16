import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface CompDetail {
  id: string
  name: string
  event_type: string
  status: string
  opens_at: string | null
  closes_at: string | null
  judging_opens_at: string | null
  judging_closes_at: string | null
  max_projim_entries: number
  max_printim_entries: number
  points_honours: number
  points_highly_commended: number
  points_commended: number
  points_accepted: number
  seasons: { year: number } | null
  competition_judges: Array<{ judges: { id: string; name: string; email: string } | null }>
}

interface CompForm {
  name: string
  event_type: string
  opens_at: string
  closes_at: string
  judging_opens_at: string
  judging_closes_at: string
  max_projim_entries: number
  max_printim_entries: number
  points_honours: number
  points_highly_commended: number
  points_commended: number
  points_accepted: number
}

interface EntrySummary {
  type: string
  award: string | null
  count: number
}

interface JudgeOption {
  id: string
  name: string
  email: string
  is_available: boolean
}

const STATUS_FLOW = ['draft', 'open', 'closed', 'judging', 'complete']

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  judging: 'bg-blue-100 text-blue-700',
  complete: 'bg-purple-100 text-purple-700',
}

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toDateInput(d: string | null) {
  if (!d) return ''
  return d.split('T')[0]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ActionButton({
  label, onClick, variant = 'primary', disabled = false,
}: {
  label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean
}) {
  const cls = {
    primary: 'bg-amber-600 text-white hover:bg-amber-700',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {label}
    </button>
  )
}

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>()
  const [comp, setComp] = useState<CompDetail | null>(null)
  const [entries, setEntries] = useState<EntrySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [working, setWorking] = useState(false)

  // Edit competition modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<CompForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Assign judge modal
  const [showJudge, setShowJudge] = useState(false)
  const [judgeOptions, setJudgeOptions] = useState<JudgeOption[]>([])
  const [selectedJudgeId, setSelectedJudgeId] = useState('')
  const [judgeSearch, setJudgeSearch] = useState('')
  const [judgeSaving, setJudgeSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('competitions')
      .select(`
        id, name, event_type, status, opens_at, closes_at,
        judging_opens_at, judging_closes_at,
        max_projim_entries, max_printim_entries,
        points_honours, points_highly_commended, points_commended, points_accepted,
        seasons(year),
        competition_judges(judges(id, name, email))
      `)
      .eq('id', id!)
      .single()

    setComp(data as CompDetail | null)

    const { data: entryData } = await supabase
      .from('entries')
      .select('type, award')
      .eq('competition_id', id!)

    const counts: Record<string, number> = {}
    for (const e of entryData ?? []) {
      const key = `${e.type}|${e.award ?? 'none'}`
      counts[key] = (counts[key] ?? 0) + 1
    }
    const summary: EntrySummary[] = Object.entries(counts).map(([k, count]) => {
      const [type, award] = k.split('|')
      return { type, award: award === 'none' ? null : award, count }
    })
    setEntries(summary)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function doAction(path: string, label: string) {
    setWorking(true)
    setActionMsg(null)
    try {
      const data = await apiFetch<{ sent?: number; skipped?: number }>(path, { method: 'POST' })
      if (data.sent !== undefined) {
        setActionMsg({ text: `${label}: ${data.sent} sent, ${data.skipped} skipped.`, ok: true })
      } else {
        setActionMsg({ text: `${label}: done.`, ok: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error'
      setActionMsg({ text: `${label} failed: ${msg}`, ok: false })
    } finally {
      setWorking(false)
    }
  }

  async function advanceStatus() {
    if (!comp) return
    const next = STATUS_FLOW[STATUS_FLOW.indexOf(comp.status) + 1]
    if (!next) return
    setWorking(true)
    const { error } = await supabase.from('competitions').update({ status: next }).eq('id', comp.id)
    if (error) {
      setActionMsg({ text: `Failed to advance status: ${error.message}`, ok: false })
    } else {
      setActionMsg({ text: `Status updated to ${next}.`, ok: true })
      await load()
    }
    setWorking(false)
  }

  function openEdit() {
    if (!comp) return
    setEditForm({
      name: comp.name,
      event_type: comp.event_type,
      opens_at: toDateInput(comp.opens_at),
      closes_at: toDateInput(comp.closes_at),
      judging_opens_at: toDateInput(comp.judging_opens_at),
      judging_closes_at: toDateInput(comp.judging_closes_at),
      max_projim_entries: comp.max_projim_entries,
      max_printim_entries: comp.max_printim_entries,
      points_honours: comp.points_honours,
      points_highly_commended: comp.points_highly_commended,
      points_commended: comp.points_commended,
      points_accepted: comp.points_accepted,
    })
    setEditError(null)
    setShowEdit(true)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm || !comp) return
    setEditSaving(true)
    setEditError(null)
    try {
      await apiFetch(`/api/competitions/${comp.id}`, { method: 'PATCH', body: JSON.stringify(editForm) })
      setShowEdit(false)
      await load()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEditSaving(false)
    }
  }

  function setEditField<K extends keyof CompForm>(k: K, v: CompForm[K]) {
    setEditForm(prev => prev ? { ...prev, [k]: v } : prev)
  }

  async function openAssignJudge() {
    const { data } = await supabase.from('judges').select('id,name,email,is_available').order('name')
    setJudgeOptions((data ?? []) as JudgeOption[])
    const current = comp?.competition_judges?.[0]?.judges
    setSelectedJudgeId(current?.id ?? '')
    setJudgeSearch('')
    setShowJudge(true)
  }

  async function handleAssignJudge() {
    if (!comp) return
    setJudgeSaving(true)
    try {
      await apiFetch(`/api/competitions/${comp.id}/judge`, {
        method: 'PUT',
        body: JSON.stringify({ judge_id: selectedJudgeId || null }),
      })
      setShowJudge(false)
      await load()
    } catch (err) {
      // show nothing, just close
    } finally {
      setJudgeSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!comp) return <div className="p-8 text-gray-400">Competition not found.</div>

  const projimTotal = entries.filter(e => e.type === 'projim').reduce((s, e) => s + e.count, 0)
  const printimTotal = entries.filter(e => e.type === 'printim').reduce((s, e) => s + e.count, 0)
  const judge = comp.competition_judges?.[0]?.judges
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(comp.status) + 1]

  const filteredJudges = judgeOptions.filter(j =>
    !judgeSearch || j.name.toLowerCase().includes(judgeSearch.toLowerCase())
  )

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-400 mb-4">
        <Link to="/competitions" className="hover:text-amber-700">Events</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{comp.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{comp.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {comp.seasons?.year} · <span className="capitalize">{comp.event_type}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[comp.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {comp.status}
          </span>
          <button
            onClick={openEdit}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${actionMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {actionMsg.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Dates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Schedule</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-400">Opens</dt><dd className="text-gray-700">{fmt(comp.opens_at)}</dd>
              <dt className="text-gray-400">Closes</dt><dd className="text-gray-700">{fmt(comp.closes_at)}</dd>
              <dt className="text-gray-400">Judging opens</dt><dd className="text-gray-700">{fmt(comp.judging_opens_at)}</dd>
              <dt className="text-gray-400">Judging closes</dt><dd className="text-gray-700">{fmt(comp.judging_closes_at)}</dd>
            </dl>
          </div>

          {/* Entries summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Entries</h2>
            <div className="flex gap-6 mb-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{projimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">PROJIM</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{printimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">PRINTIM</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{projimTotal + printimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">Total</div>
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Limits: {comp.max_projim_entries} PROJIM · {comp.max_printim_entries} PRINTIM per member
            </div>
          </div>

          {/* Points config */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Points</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-gray-400">Honours</dt><dd className="text-gray-700">{comp.points_honours}</dd>
              <dt className="text-gray-400">Highly Commended</dt><dd className="text-gray-700">{comp.points_highly_commended}</dd>
              <dt className="text-gray-400">Commended</dt><dd className="text-gray-700">{comp.points_commended}</dd>
              <dt className="text-gray-400">Accepted</dt><dd className="text-gray-700">{comp.points_accepted}</dd>
            </dl>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-4">
          {/* Judge */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Judge</h2>
              <button
                onClick={openAssignJudge}
                className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                {judge ? 'Change' : 'Assign'}
              </button>
            </div>
            {judge ? (
              <div>
                <div className="font-medium text-gray-900 text-sm">{judge.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{judge.email}</div>
              </div>
            ) : (
              <div className="text-xs text-red-500">No judge assigned</div>
            )}
          </div>

          {/* Status actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions</h2>

            {nextStatus && (
              <ActionButton label={`Advance → ${nextStatus}`} onClick={advanceStatus} disabled={working} />
            )}

            {comp.status === 'open' && (
              <>
                <ActionButton
                  label="Send submission invites"
                  onClick={() => doAction(`/api/competitions/${comp.id}/send-submission-invites`, 'Invites')}
                  variant="secondary"
                  disabled={working}
                />
                <ActionButton
                  label="Send reminders"
                  onClick={() => doAction(`/api/competitions/${comp.id}/send-submission-reminders`, 'Reminders')}
                  variant="secondary"
                  disabled={working}
                />
              </>
            )}

            {comp.status === 'judging' && judge && (
              <ActionButton
                label="Send judging invite"
                onClick={() => doAction(`/api/competitions/${comp.id}/send-judging-invite`, 'Judging invite')}
                variant="secondary"
                disabled={working}
              />
            )}

            {comp.status === 'complete' && (
              <ActionButton
                label="Send results to members"
                onClick={() => doAction(`/api/competitions/${comp.id}/send-results`, 'Results')}
                variant="secondary"
                disabled={working}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Competition Modal */}
      {showEdit && editForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit event</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Event name *">
                <input type="text" required value={editForm.name} onChange={e => setEditField('name', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Type">
                <select value={editForm.event_type} onChange={e => setEditField('event_type', e.target.value)} className={inputCls}>
                  <option value="competition">Competition</option>
                  <option value="award">Award</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Schedule</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opens">
                    <input type="date" value={editForm.opens_at} onChange={e => setEditField('opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Closes">
                    <input type="date" value={editForm.closes_at} onChange={e => setEditField('closes_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging opens">
                    <input type="date" value={editForm.judging_opens_at} onChange={e => setEditField('judging_opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging closes">
                    <input type="date" value={editForm.judging_closes_at} onChange={e => setEditField('judging_closes_at', e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Entry limits</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max PROJIM">
                    <input type="number" min={0} value={editForm.max_projim_entries} onChange={e => setEditField('max_projim_entries', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Max PRINTIM">
                    <input type="number" min={0} value={editForm.max_printim_entries} onChange={e => setEditField('max_printim_entries', Number(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Points</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Honours">
                    <input type="number" min={0} value={editForm.points_honours} onChange={e => setEditField('points_honours', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Highly Commended">
                    <input type="number" min={0} value={editForm.points_highly_commended} onChange={e => setEditField('points_highly_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Commended">
                    <input type="number" min={0} value={editForm.points_commended} onChange={e => setEditField('points_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Accepted">
                    <input type="number" min={0} value={editForm.points_accepted} onChange={e => setEditField('points_accepted', Number(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              {editError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{editError}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={editSaving} onClick={handleEditSubmit} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Judge Modal */}
      {showJudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowJudge(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Assign judge</h2>
              <button onClick={() => setShowJudge(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-4">
              <input
                type="search"
                placeholder="Search judges…"
                value={judgeSearch}
                onChange={e => setJudgeSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <div className="max-h-60 overflow-y-auto space-y-1">
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="radio" name="judge" value="" checked={selectedJudgeId === ''} onChange={() => setSelectedJudgeId('')} className="accent-amber-600" />
                  <span className="text-sm text-gray-400 italic">No judge</span>
                </label>
                {filteredJudges.map(j => (
                  <label key={j.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="judge" value={j.id} checked={selectedJudgeId === j.id} onChange={() => setSelectedJudgeId(j.id)} className="accent-amber-600" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{j.name}</div>
                      <div className="text-xs text-gray-400 truncate">{j.email}</div>
                    </div>
                    {j.is_available && (
                      <span className="text-xs text-green-600 font-medium shrink-0">Available</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowJudge(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleAssignJudge} disabled={judgeSaving} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {judgeSaving ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
