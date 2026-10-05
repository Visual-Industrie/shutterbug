import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  submission_invite: 'Submission invite',
  submission_reminder: 'Reminder',
  submission_confirmation: 'Confirmation',
  deadline_reminder: 'Deadline reminder',
  judging_invite: 'Judge invite',
  results_notification: 'Results',
  member_history_link: 'History link',
  subs_reminder: 'Subs reminder',
  one_off: 'One-off',
  new_application: 'New application',
  application_received: 'Application received',
}

interface EmailRow {
  id: string
  type: string
  recipient_email: string
  recipient_name: string | null
  subject: string
  body: string | null
  sent_at: string
  error: string | null
}

function fmt(d: string) {
  return new Date(d).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Email log scoped to one member (every email sent to them, including their
 * copy of group sends) or one competition (one row per personalised email, so
 * gaps in a bulk send are visible per member).
 */
export default function EmailLogList({ memberId, competitionId }: { memberId?: string; competitionId?: string }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['email-log', memberId ? 'member' : 'competition', memberId ?? competitionId],
    enabled: !!(memberId || competitionId),
    queryFn: async () => {
      let q = supabase
        .from('email_log')
        .select('id,type,recipient_email,recipient_name,subject,body,sent_at,error')
        .order('sent_at', { ascending: false })
      if (memberId) {
        // Per-member rows only — a group send's summary row has no member.
        q = q.eq('member_id', memberId).limit(500)
      } else {
        // Skip a group send's per-member children; its summary row stands in for them.
        q = q.eq('competition_id', competitionId!).is('batch_id', null).limit(1000)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as EmailRow[]
    },
  })

  const counts = new Map<string, { sent: number; failed: number }>()
  for (const r of rows) {
    const c = counts.get(r.type) ?? { sent: 0, failed: 0 }
    if (r.error) c.failed++
    else c.sent++
    counts.set(r.type, c)
  }

  const q = search.trim().toLowerCase()
  const visible = rows.filter(r =>
    (!typeFilter || r.type === typeFilter) &&
    (!q ||
      r.subject.toLowerCase().includes(q) ||
      r.recipient_email.toLowerCase().includes(q) ||
      (r.recipient_name ?? '').toLowerCase().includes(q)),
  )

  if (isLoading) return <p className="text-sm text-gray-400">Loading…</p>
  if (rows.length === 0) return <p className="text-sm text-gray-400">No emails logged yet.</p>

  return (
    <div className="space-y-3">
      {/* Per-type totals double as filters */}
      <div className="flex flex-wrap gap-1.5">
        {[...counts.entries()].map(([type, c]) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              typeFilter === type
                ? 'border-amber-400 bg-amber-100 text-amber-900'
                : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50'
            }`}
          >
            {EMAIL_TYPE_LABELS[type] ?? type} · {c.sent}
            {c.failed > 0 && <span className="text-red-600"> · {c.failed} failed</span>}
          </button>
        ))}
      </div>

      {competitionId && (
        <input
          type="search"
          placeholder="Search recipient or subject…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      )}

      <div className="space-y-1">
        {visible.map(e => (
          <div key={e.id} className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 truncate">
                    {competitionId ? (e.recipient_name ?? e.recipient_email) : e.subject}
                  </span>
                  {e.error && <span className="text-xs text-red-500 shrink-0">⚠ Failed</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {competitionId ? e.subject : e.recipient_email}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-gray-400">{fmt(e.sent_at)}</div>
                <div className="text-xs text-gray-400 mt-0.5">{EMAIL_TYPE_LABELS[e.type] ?? e.type}</div>
              </div>
              <span className="text-gray-400 text-xs">{expanded === e.id ? '▲' : '▼'}</span>
            </button>

            {expanded === e.id && (
              <div className="px-3 pb-3 border-t border-gray-100 text-sm space-y-2 pt-2">
                <div className="text-xs text-gray-500">
                  <span className="font-medium">To:</span> {e.recipient_email}
                </div>
                {e.error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded p-2">{e.error}</div>
                )}
                {e.body && (
                  <div
                    className="text-gray-700 text-sm prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: e.body }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <p className="text-sm text-gray-400">No matching emails.</p>}
      </div>
    </div>
  )
}
