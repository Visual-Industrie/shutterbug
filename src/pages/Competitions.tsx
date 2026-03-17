import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface Competition {
  id: string
  name: string
  event_type: string
  status: string
  opens_at: string | null
  closes_at: string | null
  judging_closes_at: string | null
  seasons: { year: number } | null
  competition_judges: Array<{ judges: { name: string } | null }>
  printim_count: number
  projim_count: number
}

interface AddForm {
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

const EMPTY_FORM: AddForm = {
  name: '',
  event_type: 'competition',
  opens_at: '',
  closes_at: '',
  judging_opens_at: '',
  judging_closes_at: '',
  max_projim_entries: 1,
  max_printim_entries: 2,
  points_honours: 6,
  points_highly_commended: 4,
  points_commended: 2,
  points_accepted: 1,
}

const STATUS_OPTS = ['all', 'draft', 'open', 'closed', 'judging', 'complete']
const TYPE_OPTS = ['all', 'competition', 'award', 'other']

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-500',
    open: 'bg-green-100 text-green-700',
    closed: 'bg-orange-100 text-orange-700',
    judging: 'bg-blue-100 text-blue-700',
    complete: 'bg-purple-100 text-purple-700',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${c[status] ?? 'bg-gray-100 text-gray-500'}`}>{status}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

export default function Competitions() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: allComps = [], isLoading } = useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('competitions')
        .select(`
          id, name, event_type, status, opens_at, closes_at, judging_closes_at,
          seasons(year),
          competition_judges(judges(name))
        `)
        .order('opens_at', { ascending: false })

      const compIds = (data ?? []).map(c => c.id)
      let entryCounts: Record<string, { printim: number; projim: number }> = {}
      if (compIds.length > 0) {
        const { data: entries } = await supabase
          .from('entries')
          .select('competition_id, type')
          .in('competition_id', compIds)
        for (const e of entries ?? []) {
          if (!entryCounts[e.competition_id]) entryCounts[e.competition_id] = { printim: 0, projim: 0 }
          if (e.type === 'printim') entryCounts[e.competition_id].printim++
          else entryCounts[e.competition_id].projim++
        }
      }

      return (data ?? []).map(c => ({
        ...c,
        competition_judges: c.competition_judges as unknown as Array<{ judges: { name: string } | null }>,
        printim_count: entryCounts[c.id]?.printim ?? 0,
        projim_count: entryCounts[c.id]?.projim ?? 0,
      })) as unknown as Competition[]
    },
  })

  const comps = allComps.filter(c => {
    if (status !== 'all' && c.status !== status) return false
    if (type !== 'all' && c.event_type !== type) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const createMutation = useMutation({
    mutationFn: (form: AddForm) =>
      apiFetch<{ id: string }>('/api/competitions', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      setShowModal(false)
      navigate(`/competitions/${data.id}`)
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    },
  })

  async function openModal() {
    setFormError(null)
    setShowModal(true)
    try {
      const rows = await apiFetch<{ key: string; value: string | null; default_value: string | null }[]>('/api/settings?section=COMP')
      const get = (key: string, fallback: number) => {
        const row = rows.find(r => r.key === key)
        const v = row?.value ?? row?.default_value
        return v != null ? Number(v) : fallback
      }
      setForm({
        ...EMPTY_FORM,
        max_projim_entries:      get('COMP-Upload Limit PROJIM',    EMPTY_FORM.max_projim_entries),
        max_printim_entries:     get('COMP-Upload Limit PRINTIM',   EMPTY_FORM.max_printim_entries),
        points_honours:          get('COMP-Points Honours',          EMPTY_FORM.points_honours),
        points_highly_commended: get('COMP-Points Highly Commended', EMPTY_FORM.points_highly_commended),
        points_commended:        get('COMP-Points Commended',        EMPTY_FORM.points_commended),
        points_accepted:         get('COMP-Points Accepted',         EMPTY_FORM.points_accepted),
      })
    } catch {
      setForm(EMPTY_FORM)
    }
  }

  function setField<K extends keyof AddForm>(k: K, v: AddForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    createMutation.mutate(form)
  }

  function fmt(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-0.5">{comps.length} shown</p>
        </div>
        <button
          onClick={openModal}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          + Add event
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          placeholder="Search event name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {STATUS_OPTS.map(o => <option key={o} value={o}>{o === 'all' ? 'All statuses' : o}</option>)}
        </select>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {TYPE_OPTS.map(o => <option key={o} value={o}>{o === 'all' ? 'All types' : o}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Year</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Opens</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Closes</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Judge</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PRINT</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">PROJ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {comps.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No events found</td></tr>
              )}
              {comps.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-xs">{(c.seasons as { year: number } | null)?.year ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link to={`/competitions/${c.id}`} className="font-medium text-amber-700 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-xs">{c.event_type}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.opens_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(c.closes_at)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.competition_judges?.[0]?.judges?.name ?? (
                      <span className="text-red-400 text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{c.printim_count || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{c.projim_count || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Add event</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Event name *">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  className={inputCls}
                  placeholder="e.g. March Monthly Competition"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select value={form.event_type} onChange={e => setField('event_type', e.target.value)} className={inputCls}>
                    <option value="competition">Competition</option>
                    <option value="award">Award</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Schedule</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opens">
                    <input type="date" value={form.opens_at} onChange={e => setField('opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Closes">
                    <input type="date" value={form.closes_at} onChange={e => setField('closes_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging opens">
                    <input type="date" value={form.judging_opens_at} onChange={e => setField('judging_opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging closes">
                    <input type="date" value={form.judging_closes_at} onChange={e => setField('judging_closes_at', e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Entry limits</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max PROJIM entries">
                    <input
                      type="number"
                      min={0}
                      value={form.max_projim_entries}
                      onChange={e => setField('max_projim_entries', Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Max PRINTIM entries">
                    <input
                      type="number"
                      min={0}
                      value={form.max_printim_entries}
                      onChange={e => setField('max_printim_entries', Number(e.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Points</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Honours">
                    <input type="number" min={0} value={form.points_honours} onChange={e => setField('points_honours', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Highly Commended">
                    <input type="number" min={0} value={form.points_highly_commended} onChange={e => setField('points_highly_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Commended">
                    <input type="number" min={0} value={form.points_commended} onChange={e => setField('points_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Accepted">
                    <input type="number" min={0} value={form.points_accepted} onChange={e => setField('points_accepted', Number(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              {formError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                onClick={handleSubmit}
                className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
