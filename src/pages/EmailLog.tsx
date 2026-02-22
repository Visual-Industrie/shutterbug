import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface EmailEntry {
  id: string
  type: string
  recipient_email: string
  recipient_name: string | null
  subject: string
  body: string | null
  sent_at: string
  error: string | null
}

const TYPE_LABELS: Record<string, string> = {
  submission_invite: 'Submission invite',
  submission_reminder: 'Reminder',
  submission_confirmation: 'Confirmation',
  judging_invite: 'Judge invite',
  results_notification: 'Results',
  member_history_link: 'History link',
  subs_reminder: 'Subs reminder',
  one_off: 'One-off',
}

export default function EmailLog() {
  const [emails, setEmails] = useState<EmailEntry[]>([])
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let q = supabase
        .from('email_log')
        .select('id,type,recipient_email,recipient_name,subject,body,sent_at,error')
        .order('sent_at', { ascending: false })
        .limit(200)

      if (search) {
        q = q.or(
          `subject.ilike.%${search}%,recipient_email.ilike.%${search}%,recipient_name.ilike.%${search}%`
        )
      }

      const { data } = await q
      setEmails(data ?? [])
      setLoading(false)
    }
    load()
  }, [search])

  function fmt(d: string) {
    return new Date(d).toLocaleString('en-NZ', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send and review club emails</p>
        </div>
        <button className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors">
          + Send email
        </button>
      </div>

      <input
        type="search"
        placeholder="Search subject, recipient…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
      />

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : emails.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No emails logged yet</div>
      ) : (
        <div className="space-y-1">
          {emails.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">{e.subject}</span>
                    {e.error && <span className="text-xs text-red-500">⚠ Failed</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {e.recipient_name ?? e.recipient_email}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-gray-400">{fmt(e.sent_at)}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{TYPE_LABELS[e.type] ?? e.type}</div>
                </div>
                <span className="text-gray-400 text-xs">{expanded === e.id ? '▲' : '▼'}</span>
              </button>

              {expanded === e.id && (
                <div className="px-4 pb-4 border-t border-gray-100 text-sm space-y-2 pt-3">
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
        </div>
      )}
    </div>
  )
}
