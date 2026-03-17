import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface LeaderRow {
  member_id: string
  name: string
  projim: number
  printim: number
  total: number
}

interface Season {
  id: string
  year: number
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const [tab, setTab] = useState<'combined' | 'printim' | 'projim'>('combined')
  const [seasonId, setSeasonId] = useState<string>('')

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ['seasons'],
    queryFn: async () => {
      const [{ data: all }, { data: current }] = await Promise.all([
        supabase.from('seasons').select('id, year').order('year', { ascending: false }),
        supabase.from('seasons').select('id').eq('is_current_event_year', true).single(),
      ])
      if (current && !seasonId) setSeasonId(current.id)
      return (all ?? []) as Season[]
    },
  })

  const { data: rows = [], isLoading } = useQuery<LeaderRow[]>({
    queryKey: ['points', seasonId, tab],
    queryFn: async () => {
      const { data } = await supabase
        .from('member_points')
        .select('member_id, entry_type, points, members(first_name, last_name)')
        .eq('season_id', seasonId)

      const totals = new Map<string, LeaderRow>()
      for (const r of data ?? []) {
        const m = r.members as unknown as { first_name: string; last_name: string } | null
        const name = m ? `${m.first_name} ${m.last_name}` : r.member_id
        const existing = totals.get(r.member_id)
        if (existing) {
          if (r.entry_type === 'projim') existing.projim += r.points
          else existing.printim += r.points
          existing.total += r.points
        } else {
          totals.set(r.member_id, {
            member_id: r.member_id,
            name,
            projim: r.entry_type === 'projim' ? r.points : 0,
            printim: r.entry_type === 'printim' ? r.points : 0,
            total: r.points,
          })
        }
      }

      return Array.from(totals.values())
        .sort((a, b) => {
          const av = tab === 'projim' ? a.projim : tab === 'printim' ? a.printim : a.total
          const bv = tab === 'projim' ? b.projim : tab === 'printim' ? b.printim : b.total
          return bv - av
        })
        .filter(r => (tab === 'projim' ? r.projim : tab === 'printim' ? r.printim : r.total) > 0)
    },
    enabled: !!seasonId,
  })

  const selectedYear = seasons.find(s => s.id === seasonId)?.year

  function score(r: LeaderRow) {
    if (tab === 'projim') return r.projim
    if (tab === 'printim') return r.printim
    return r.total
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedYear} season</p>
        </div>
        <select
          value={seasonId}
          onChange={e => setSeasonId(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.year}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['combined', 'printim', 'projim'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'combined' ? 'Combined' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No points recorded for {selectedYear}</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div
              key={r.member_id}
              className={`rounded-xl border flex items-center px-4 py-3 gap-3 ${
                i === 0 ? 'border-yellow-300 bg-yellow-50' :
                i === 1 ? 'border-gray-300 bg-white' :
                i === 2 ? 'border-amber-200 bg-amber-50/40' :
                'border-gray-200 bg-white'
              }`}
            >
              <span className="w-7 text-center shrink-0">
                {i < 3
                  ? <span className="text-lg">{MEDALS[i]}</span>
                  : <span className="text-sm text-gray-400">{i + 1}</span>
                }
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900">{r.name}</span>
              {tab === 'combined' && (
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {r.printim}p · {r.projim}j
                </span>
              )}
              <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full shrink-0 tabular-nums ${
                i === 0 ? 'bg-yellow-100 text-yellow-800' :
                i === 1 ? 'bg-gray-100 text-gray-700' :
                i === 2 ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {score(r)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
