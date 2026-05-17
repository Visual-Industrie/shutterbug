import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

interface ReportEntry {
  id: string
  type: 'projim' | 'printim'
  title: string
  drive_file_url: string | null
  award: string | null
  judge_comment: string | null
  first_name: string
  last_name: string
  membership_number: string | null
}

interface ReportData {
  competition: { id: string; name: string; status: string }
  entries: ReportEntry[]
}

const AWARD_LABELS: Record<string, string> = {
  honours: 'Honours',
  highly_commended: 'Highly Commended',
  commended: 'Commended',
  accepted: 'Accepted',
  winner: 'Winner',
  shortlisted: 'Shortlisted',
}

function stripHtml(html: string) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

function downloadCsv(competition: ReportData['competition'], entries: ReportEntry[]) {
  const headers = ['Type', 'Member Name', 'Member Number', 'Title', 'Grade', 'Judge Comment', 'File URL']
  const rows = entries.map(e => [
    e.type === 'projim' ? 'Projected' : 'Print',
    `${e.first_name} ${e.last_name}`,
    e.membership_number ?? '',
    e.title,
    e.award ? (AWARD_LABELS[e.award] ?? e.award) : 'Not Placed',
    e.judge_comment ? stripHtml(e.judge_comment) : '',
    e.drive_file_url ?? '',
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${competition.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-website-report.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function WebsiteReport() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ['website-report', id],
    queryFn: () => apiFetch<ReportData>(`/api/competitions/${id}/website-report`),
  })

  if (isLoading) return <div className="p-8 text-sm text-gray-400">Loading…</div>
  if (error || !data) return <div className="p-8 text-sm text-red-500">{(error as Error)?.message ?? 'Failed to load'}</div>

  const { competition, entries } = data

  const projim = entries.filter(e => e.type === 'projim')
  const printim = entries.filter(e => e.type === 'printim')

  function EntryTable({ rows }: { rows: ReportEntry[] }) {
    if (rows.length === 0) return <p className="text-sm text-gray-400 py-2">No entries.</p>
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Member</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">No.</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Title</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Grade</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Judge Comment</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Image</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{e.first_name} {e.last_name}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{e.membership_number ?? '—'}</td>
                <td className="px-3 py-2 text-gray-800">{e.title}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.award
                    ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">{AWARD_LABELS[e.award] ?? e.award}</span>
                    : <span className="text-gray-400 text-xs">Not Placed</span>
                  }
                </td>
                <td className="px-3 py-2 text-gray-600 max-w-sm">
                  {e.judge_comment
                    ? <div className="prose prose-xs max-w-none text-xs" dangerouslySetInnerHTML={{ __html: e.judge_comment }} />
                    : <span className="text-gray-300">—</span>
                  }
                </td>
                <td className="px-3 py-2">
                  {e.drive_file_url
                    ? <a href={e.drive_file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Download</a>
                    : <span className="text-gray-300 text-xs">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link to={`/competitions/${id}`} className="text-xs text-gray-400 hover:text-amber-600 transition-colors">← Back to competition</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{competition.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Website manager report</p>
        </div>
        <button
          onClick={() => downloadCsv(competition, entries)}
          className="shrink-0 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          Download CSV
        </button>
      </div>

      <div className="space-y-8">
        {projim.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Projected Images ({projim.length})</h2>
            </div>
            <EntryTable rows={projim} />
          </div>
        )}
        {printim.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Print Images ({printim.length})</h2>
            </div>
            <EntryTable rows={printim} />
          </div>
        )}
        {entries.length === 0 && (
          <p className="text-sm text-gray-400">No entries for this competition.</p>
        )}
      </div>
    </div>
  )
}
