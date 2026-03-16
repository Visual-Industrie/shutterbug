import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface Kpis {
  noJudgeCount: number
  competitionsRemaining: number
  judgesAvailable: number
  competitionsOpen: number
  printimOpen: number
  projimOpen: number
  currentMembers: number
  lifeMembers: number
  recentSubmitters: number
  pendingApplicants: number
  committeeCount: number
}

interface EventRow {
  id: string
  name: string
  event_type: string
  status: string
  opens_at: string | null
  closes_at: string | null
  judging_closes_at: string | null
  judge_name: string | null
  printim_count: number
  projim_count: number
}

type KpiVariant = 'normal' | 'warn' | 'alert' | 'good'

function KpiCard({
  label, value, sub, variant = 'normal', to,
}: {
  label: string
  value: number | string
  sub?: string
  variant?: KpiVariant
  to?: string
}) {
  const styles: Record<KpiVariant, { card: string; value: string }> = {
    normal: { card: 'bg-white border-gray-200', value: 'text-amber-600' },
    good:   { card: 'bg-white border-gray-200', value: 'text-green-600' },
    warn:   { card: 'bg-amber-50 border-amber-200', value: 'text-amber-700' },
    alert:  { card: 'bg-red-50 border-red-200', value: 'text-red-600' },
  }
  const s = styles[variant]
  const inner = (
    <div className={`rounded-xl border p-4 transition-colors ${s.card} ${to ? 'hover:border-amber-300 cursor-pointer' : ''}`}>
      <div className={`text-2xl font-bold ${s.value}`}>{value}</div>
      <div className="text-sm font-medium text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    open: 'bg-green-100 text-green-700',
    closed: 'bg-orange-100 text-orange-700',
    judging: 'bg-blue-100 text-blue-700',
    complete: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${colours[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_current_event_year', true)
        .single()

      const seasonId = season?.id

      const { data: comps } = await supabase
        .from('competitions')
        .select('id, name, event_type, status, opens_at, closes_at, judging_closes_at, competition_judges(judges(name)), entries(type)')
        .eq('season_id', seasonId ?? '')
        .order('opens_at', { ascending: true })

      const noJudge = comps?.filter(c =>
        c.event_type === 'competition' &&
        c.status !== 'complete' &&
        (!c.competition_judges || c.competition_judges.length === 0)
      ).length ?? 0

      const remaining = comps?.filter(c =>
        c.event_type === 'competition' && c.status !== 'complete'
      ).length ?? 0

      const openComp = comps?.find(c => c.status === 'open')
      const printimOpen = openComp?.entries?.filter((e: { type: string }) => e.type === 'printim').length ?? 0
      const projimOpen  = openComp?.entries?.filter((e: { type: string }) => e.type === 'projim').length ?? 0

      const [
        { count: currentMembers },
        { count: lifeMembers },
        { count: committeeCount },
        { count: pendingApplicants },
        { count: judgesAvailable },
        { data: recentEntries },
      ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('membership_type', 'life').eq('status', 'active'),
        supabase.from('admin_users').select('*', { count: 'exact', head: true }),
        supabase.from('applicants').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('judges').select('*', { count: 'exact', head: true }).eq('is_available', true),
        supabase.from('entries').select('member_id').gte('submitted_at', new Date(Date.now() - 90 * 864e5).toISOString()),
      ])

      const recentSubmitters = new Set(recentEntries?.map(e => e.member_id)).size

      setKpis({
        noJudgeCount: noJudge,
        competitionsRemaining: remaining,
        judgesAvailable: judgesAvailable ?? 0,
        competitionsOpen: comps?.filter(c => c.status === 'open').length ?? 0,
        printimOpen,
        projimOpen,
        currentMembers: currentMembers ?? 0,
        lifeMembers: lifeMembers ?? 0,
        recentSubmitters,
        pendingApplicants: pendingApplicants ?? 0,
        committeeCount: committeeCount ?? 0,
      })

      setEvents((comps ?? []).map(c => ({
        id: c.id,
        name: c.name,
        event_type: c.event_type,
        status: c.status,
        opens_at: c.opens_at,
        closes_at: c.closes_at,
        judging_closes_at: c.judging_closes_at,
        judge_name: (c.competition_judges as unknown as Array<{ judges: { name: string } | null }>)?.[0]?.judges?.name ?? null,
        printim_count: (c.entries as Array<{ type: string }>)?.filter(e => e.type === 'printim').length ?? 0,
        projim_count:  (c.entries as Array<{ type: string }>)?.filter(e => e.type === 'projim').length ?? 0,
      })))

      setLoading(false)
    }
    load()
  }, [])

  function fmt(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const k = kpis!

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Current season snapshot</p>

      {/* Attention alerts */}
      {(k.noJudgeCount > 0 || k.pendingApplicants > 0) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {k.noJudgeCount > 0 && (
            <Link to="/competitions" className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 hover:bg-red-100 transition-colors">
              ⚠ {k.noJudgeCount} competition{k.noJudgeCount > 1 ? 's' : ''} without a judge
            </Link>
          )}
          {k.pendingApplicants > 0 && (
            <Link to="/applicants" className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 hover:bg-amber-100 transition-colors">
              ● {k.pendingApplicants} pending applicant{k.pendingApplicants > 1 ? 's' : ''}
            </Link>
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
        <KpiCard label="No judge assigned"       value={k.noJudgeCount}          variant={k.noJudgeCount > 0 ? 'alert' : 'normal'}  to="/competitions" />
        <KpiCard label="Competitions remaining"   value={k.competitionsRemaining}  sub="this year"                                      to="/competitions" />
        <KpiCard label="Judges available"         value={k.judgesAvailable}        to="/judges" />
        <KpiCard label="Competitions open"        value={k.competitionsOpen}       variant={k.competitionsOpen > 0 ? 'good' : 'normal'} to="/competitions" />
        <KpiCard label="PRINTIM entries"          value={k.printimOpen}            sub="current open comp" />
        <KpiCard label="PROJIM entries"           value={k.projimOpen}             sub="current open comp" />
        <KpiCard label="Current members"          value={k.currentMembers}         to="/members" />
        <KpiCard label="Life members"             value={k.lifeMembers}            to="/members" />
        <KpiCard label="Active submitters"        value={k.recentSubmitters}       sub="last 3 months" />
        <KpiCard label="Pending applicants"       value={k.pendingApplicants}      variant={k.pendingApplicants > 0 ? 'warn' : 'normal'} to="/applicants" />
        <KpiCard label="Admin / committee"        value={k.committeeCount} />
      </div>

      {/* Event Schedule */}
      <h2 className="text-base font-semibold text-gray-800 mb-3">Event schedule — current year</h2>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Event</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Opens</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Closes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Judge</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">PRINT</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">PROJ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">No events this season</td>
              </tr>
            )}
            {events.map(ev => (
              <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/competitions/${ev.id}`} className="font-medium text-amber-700 hover:underline">
                    {ev.name}
                  </Link>
                  {ev.event_type !== 'competition' && (
                    <span className="ml-2 text-xs text-gray-400 capitalize">{ev.event_type}</span>
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                <td className="px-4 py-3 text-gray-600">{fmt(ev.opens_at)}</td>
                <td className="px-4 py-3 text-gray-600">{fmt(ev.closes_at)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {ev.judge_name ?? <span className="text-red-400 text-xs font-medium">Unassigned</span>}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{ev.printim_count || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-600">{ev.projim_count || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
