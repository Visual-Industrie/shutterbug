import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

interface HistoryEntry {
  entryId: string
  competitionId: string
  competitionName: string
  seasonYear: number
  type: string
  title: string
  award: string | null
  pointsAwarded: number | null
  driveThumbnailUrl: string | null
  driveFileUrl: string | null
  submittedAt: string
}

interface SeasonSummary {
  year: number
  projimPoints: number
  printimPoints: number
  totalPoints: number
  entries: HistoryEntry[]
}

interface PageData {
  member: {
    firstName: string
    lastName: string
    membershipNumber: string | null
    joinedDate: string | null
  }
  seasons: SeasonSummary[]
}

const AWARD_LABEL: Record<string, string> = {
  honours: 'Honours',
  highly_commended: 'Highly Commended',
  commended: 'Commended',
  accepted: 'Accepted',
  winner: 'Winner',
  shortlisted: 'Shortlisted',
}

const AWARD_STYLE: Record<string, string> = {
  honours: 'bg-yellow-100 text-yellow-800',
  highly_commended: 'bg-amber-100 text-amber-800',
  commended: 'bg-orange-100 text-orange-700',
  accepted: 'bg-blue-100 text-blue-700',
  winner: 'bg-purple-100 text-purple-700',
  shortlisted: 'bg-gray-100 text-gray-600',
}

export default function History() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch(`/api/history/${token}`)
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? 'Invalid or expired link')
        } else {
          const d: PageData = await res.json()
          setData(d)
          // Open the most recent season by default
          if (d.seasons.length > 0) setOpenSeasons(new Set([d.seasons[0].year]))
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  function toggleSeason(year: number) {
    setOpenSeasons(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
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

  const { member, seasons } = data
  const totalEntries = seasons.reduce((s, season) => s + season.entries.length, 0)
  const totalPoints = seasons.reduce((s, season) => s + season.totalPoints, 0)
  const honours = seasons.flatMap(s => s.entries).filter(e => e.award === 'honours').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
            Wairarapa Camera Club
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {member.firstName} {member.lastName}
          </h1>
          {member.membershipNumber && (
            <p className="text-sm text-gray-400 mt-0.5">Member #{member.membershipNumber}</p>
          )}

          {/* Summary stats */}
          <div className="flex gap-6 mt-4">
            <div>
              <div className="text-xl font-bold text-amber-700">{totalEntries}</div>
              <div className="text-xs text-gray-400">entries</div>
            </div>
            <div>
              <div className="text-xl font-bold text-amber-700">{totalPoints}</div>
              <div className="text-xs text-gray-400">points total</div>
            </div>
            {honours > 0 && (
              <div>
                <div className="text-xl font-bold text-yellow-600">{honours}</div>
                <div className="text-xs text-gray-400">honours</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {seasons.length === 0 && (
          <div className="text-center py-16 text-gray-400">No judged entries yet.</div>
        )}

        {seasons.map(season => {
          const isOpen = openSeasons.has(season.year)
          // Group entries by competition
          const byComp = new Map<string, { name: string; entries: HistoryEntry[] }>()
          for (const e of season.entries) {
            if (!byComp.has(e.competitionId)) {
              byComp.set(e.competitionId, { name: e.competitionName, entries: [] })
            }
            byComp.get(e.competitionId)!.entries.push(e)
          }

          return (
            <div key={season.year} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Season header */}
              <button
                onClick={() => toggleSeason(season.year)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div>
                  <span className="font-semibold text-gray-900">{season.year}</span>
                  <span className="text-sm text-gray-400 ml-3">{season.entries.length} entries</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-amber-700">{season.totalPoints} pts</div>
                    <div className="text-xs text-gray-400">
                      {season.projimPoints} PROJ · {season.printimPoints} PRINT
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Competition groups */}
              {isOpen && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {Array.from(byComp.entries()).map(([compId, { name, entries: compEntries }]) => (
                    <div key={compId} className="px-5 py-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        {name}
                      </div>
                      <div className="space-y-2">
                        {compEntries.map(e => (
                          <div key={e.entryId} className="flex items-center gap-3">
                            {/* Thumbnail */}
                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                              {e.driveThumbnailUrl ? (
                                <img
                                  src={e.driveThumbnailUrl}
                                  alt={e.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">📷</div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {e.driveFileUrl
                                  ? <a href={e.driveFileUrl} target="_blank" rel="noopener noreferrer" className="hover:text-amber-700">{e.title}</a>
                                  : e.title
                                }
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{e.type.toUpperCase()}</div>
                            </div>

                            {/* Award + points */}
                            <div className="text-right shrink-0">
                              {e.award ? (
                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${AWARD_STYLE[e.award] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {AWARD_LABEL[e.award] ?? e.award}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Not placed</span>
                              )}
                              {e.pointsAwarded != null && e.pointsAwarded > 0 && (
                                <div className="text-xs text-amber-700 font-semibold mt-0.5">{e.pointsAwarded} pts</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
