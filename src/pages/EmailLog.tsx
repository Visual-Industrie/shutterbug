import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

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

type Recipients = 'all_active' | 'subs_unpaid' | 'member'

interface MemberOption {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function EmailLog() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Compose modal
  const [showCompose, setShowCompose] = useState(false)
  const [recipients, setRecipients] = useState<Recipients>('all_active')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ sent: number; skipped: number } | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: allEmails = [], isLoading } = useQuery({
    queryKey: ['emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_log')
        .select('id,type,recipient_email,recipient_name,subject,body,sent_at,error')
        .order('sent_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
  })

  const emails = search
    ? allEmails.filter(e => {
        const q = search.toLowerCase()
        return (
          e.subject.toLowerCase().includes(q) ||
          e.recipient_email.toLowerCase().includes(q) ||
          (e.recipient_name ?? '').toLowerCase().includes(q)
        )
      })
    : allEmails

  function fmt(d: string) {
    return new Date(d).toLocaleString('en-NZ', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function searchMembers(q: string) {
    if (!q.trim()) { setMemberOptions([]); return }
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email')
      .eq('status', 'active')
      .ilike('last_name', `%${q}%`)
      .not('email', 'like', '%@privacy.wcc.local')
      .order('last_name')
      .limit(20)
    setMemberOptions((data ?? []) as MemberOption[])
  }

  function openCompose() {
    setRecipients('all_active')
    setMemberSearch('')
    setMemberOptions([])
    setSelectedMember(null)
    setSubject('')
    setBody('')
    setSendResult(null)
    setSendError(null)
    setShowCompose(true)
  }

  async function handleSend() {
    setSendError(null)
    setSendResult(null)
    if (!subject.trim()) { setSendError('Subject is required'); return }
    if (!body.trim()) { setSendError('Body is required'); return }
    if (recipients === 'member' && !selectedMember) { setSendError('Please select a member'); return }

    setSending(true)
    try {
      const result = await apiFetch<{ sent: number; skipped: number }>('/api/email/send-bulk', {
        method: 'POST',
        body: JSON.stringify({
          recipients,
          member_id: recipients === 'member' ? selectedMember?.id : undefined,
          subject: subject.trim(),
          body: body.trim(),
        }),
      })
      setSendResult(result)
      queryClient.invalidateQueries({ queryKey: ['emails'] })
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Send and review club emails</p>
        </div>
        <button
          onClick={openCompose}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
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

      {isLoading ? (
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

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => !sending && setShowCompose(false)} />
          <div className="relative bg-white h-full w-full max-w-lg shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Send email</h2>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Recipients */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Recipients</label>
                <div className="space-y-2">
                  {([
                    ['all_active', 'All active members'],
                    ['subs_unpaid', 'Active members with unpaid subs'],
                    ['member', 'Specific member…'],
                  ] as [Recipients, string][]).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="recipients"
                        value={val}
                        checked={recipients === val}
                        onChange={() => { setRecipients(val); setSelectedMember(null); setMemberSearch(''); setMemberOptions([]) }}
                        className="accent-amber-600"
                      />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>

                {recipients === 'member' && (
                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="Search by last name…"
                      value={memberSearch}
                      onChange={e => { setMemberSearch(e.target.value); setSelectedMember(null); searchMembers(e.target.value) }}
                      className={inputCls}
                    />
                    {memberOptions.length > 0 && !selectedMember && (
                      <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                        {memberOptions.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setSelectedMember(m); setMemberSearch(`${m.first_name} ${m.last_name}`); setMemberOptions([]) }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0"
                          >
                            <span className="font-medium">{m.first_name} {m.last_name}</span>
                            <span className="text-gray-400 ml-2 text-xs">{m.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedMember && (
                      <p className="mt-1 text-xs text-green-600">✓ {selectedMember.first_name} {selectedMember.last_name} — {selectedMember.email}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className={inputCls}
                  placeholder="Email subject…"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Body</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={12}
                  className={`${inputCls} resize-y font-sans`}
                  placeholder="Write your message here…&#10;&#10;Separate paragraphs with a blank line."
                />
                <p className="text-xs text-gray-400 mt-1">Plain text. Separate paragraphs with a blank line. A club signature will be added automatically.</p>
              </div>

              {sendError && <p className="text-sm text-red-600">{sendError}</p>}

              {sendResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  Sent to {sendResult.sent} member{sendResult.sent !== 1 ? 's' : ''}.
                  {sendResult.skipped > 0 && ` ${sendResult.skipped} skipped.`}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {sendResult ? 'Close' : 'Cancel'}
              </button>
              {!sendResult && (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
