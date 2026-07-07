import { useState } from 'react'

export interface HistoryEntry {
  entryId: string
  competitionId: string
  competitionName: string
  seasonYear: number
  type: string
  title: string
  award: string | null
  judgeComment: string | null
  pointsAwarded: number | null
  driveThumbnailUrl: string | null
  driveFileUrl: string | null
  submittedAt: string
}

export interface SeasonSummary {
  year: number
  projimPoints: number
  printimPoints: number
  totalPoints: number
  entries: HistoryEntry[]
}

export interface MemberHistoryData {
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

export default function MemberHistoryView({ data }: { data: MemberHistoryData }) {
  const { seasons } = data
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(
    () => new Set(seasons.length > 0 ? [seasons[0].year] : []),
  )

  function toggleSeason(year: number) {
    setOpenSeasons(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  const totalEntries = seasons.reduce((s, season) => s + season.entries.length, 0)
  const totalPoints = seasons.reduce((s, season) => s + season.totalPoints, 0)
  const honours = seasons.flatMap(s => s.entries).filter(e => e.award === 'honours').length

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex gap-6">
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

            {isOpen && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {Array.from(byComp.entries()).map(([compId, { name, entries: compEntries }]) => (
                  <div key={compId} className="px-5 py-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      {name}
                    </div>
                    <div className="space-y-3">
                      {compEntries.map(e => (
                        <div key={e.entryId}>
                          <div className="flex items-center gap-3">
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

                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {e.driveFileUrl
                                  ? <a href={e.driveFileUrl} target="_blank" rel="noopener noreferrer" className="hover:text-amber-700">{e.title}</a>
                                  : e.title
                                }
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">{e.type.toUpperCase()}</div>
                            </div>

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

                          {/* Judge comment (raw HTML from TipTap) */}
                          {e.judgeComment && (
                            <div
                              className="mt-2 ml-[3.75rem] text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: e.judgeComment }}
                            />
                          )}
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
  )
}
