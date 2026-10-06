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

// Competition emails that go to every active member, so anyone active (and
// already a member) when the send went out but missing from it was skipped.
const ALL_MEMBER_TYPES = new Set(['submission_invite', 'submission_reminder', 'deadline_reminder'])

interface EmailRow {
  id: string
  type: string
  member_id: string | null
  recipient_email: string
  recipient_name: string | null
  subject: string
  body: string | null
  sent_at: string
  error: string | null
}

interface MemberLite {
  id: string
  first_name: string
  last_name: string
  status: string
  email: string
  created_at: string
}

function fmt(d: string) {
  return new Date(d).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const SELECT = 'id,type,member_id,recipient_email,recipient_name,subject,body,sent_at,error'

/**
 * Email log scoped to one member (every email sent to them, including their
 * copy of group sends) or one competition (grouped by email type, with who
 * was missed from each all-member send).
 */
export default function EmailLogList({ memberId, competitionId }: { memberId?: string; competitionId?: string }) {
  if (memberId) return <MemberEmailLog memberId={memberId} />
  if (competitionId) return <CompetitionEmailLog competitionId={competitionId} />
  return null
}

function EmailRowItem({ e, title, subtitle }: { e: EmailRow; title: string; subtitle: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-900 truncate">{title}</span>
            {e.error && <span className="text-xs text-red-500 shrink-0">⚠ Failed</span>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400">{fmt(e.sent_at)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{EMAIL_TYPE_LABELS[e.type] ?? e.type}</div>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
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
  )
}

function MemberEmailLog({ memberId }: { memberId: string }) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['email-log', 'member', memberId],
    queryFn: async () => {
      // Per-member rows only — a group send's summary row has no member.
      const { data, error } = await supabase
        .from('email_log')
        .select(SELECT)
        .eq('member_id', memberId)
        .order('sent_at', { ascending: false })
        .limit(500)
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

  const visible = typeFilter ? rows.filter(r => r.type === typeFilter) : rows

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

      <div className="space-y-1">
        {visible.map(e => <EmailRowItem key={e.id} e={e} title={e.subject} subtitle={e.recipient_email} />)}
      </div>
    </div>
  )
}

interface EmailGroup {
  type: string
  rows: EmailRow[]
  firstSentAt: string
  /** Distinct recipients reached successfully. */
  sentCount: number
  /** Members who should have had this email but have no successful send — null where that doesn't apply. */
  notSent: Array<{ member: MemberLite; error: string | null }> | null
}

function CompetitionEmailLog({ competitionId }: { competitionId: string }) {
  const [openType, setOpenType] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['email-log', 'competition', competitionId],
    queryFn: async () => {
      // Skip a group send's per-member children; its summary row stands in for them.
      const [log, members, entrants] = await Promise.all([
        supabase
          .from('email_log')
          .select(SELECT)
          .eq('competition_id', competitionId)
          .is('batch_id', null)
          .order('sent_at', { ascending: false })
          .limit(1000),
        supabase
          .from('members')
          .select('id,first_name,last_name,status,email,created_at')
          .order('last_name')
          .order('first_name'),
        supabase.from('entries').select('member_id').eq('competition_id', competitionId),
      ])
      if (log.error) throw log.error
      if (members.error) throw members.error
      if (entrants.error) throw entrants.error
      return {
        rows: (log.data ?? []) as EmailRow[],
        members: (members.data ?? []) as MemberLite[],
        entrantIds: new Set((entrants.data ?? []).map(e => e.member_id as string)),
      }
    },
  })

  if (isLoading) return <p className="text-sm text-gray-400">Loading…</p>
  if (!data || data.rows.length === 0) return <p className="text-sm text-gray-400">No emails logged yet.</p>

  const groups = buildGroups(data.rows, data.members, data.entrantIds)

  return (
    <div className="space-y-2">
      {groups.map(g => {
        const open = openType === g.type
        return (
          <div key={g.type} className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenType(open ? null : g.type)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="flex-1 text-sm font-medium text-gray-900">{EMAIL_TYPE_LABELS[g.type] ?? g.type}</span>
              <span className="text-xs text-green-700">{g.sentCount} sent</span>
              {g.notSent && g.notSent.length > 0 && (
                <span className="text-xs text-red-600">{g.notSent.length} not sent</span>
              )}
              <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
              <div className="p-3 space-y-3 border-t border-gray-200">
                {g.notSent && g.notSent.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-red-800 mb-1">Not sent</p>
                    <ul className="space-y-0.5">
                      {g.notSent.map(({ member, error }) => (
                        <li key={member.id} className="text-xs text-red-700">
                          {member.first_name} {member.last_name}
                          {error && <span className="text-red-500"> — failed: {error}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="space-y-1">
                  {g.rows.map(e => (
                    <EmailRowItem key={e.id} e={e} title={e.recipient_name ?? e.recipient_email} subtitle={e.subject} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {groups.some(g => g.notSent && g.notSent.length > 0) && (
        <p className="text-xs text-gray-400">
          "Not sent" counts members who are active now and had joined before the email first went out
          (results: members with entries), but have no successful send.
        </p>
      )}
    </div>
  )
}

function buildGroups(rows: EmailRow[], members: MemberLite[], entrantIds: Set<string>): EmailGroup[] {
  const byType = new Map<string, EmailRow[]>()
  for (const r of rows) {
    const list = byType.get(r.type)
    if (list) list.push(r)
    else byType.set(r.type, [r])
  }

  const groups: EmailGroup[] = []
  for (const [type, list] of byType) {
    // Rows arrive newest first.
    const firstSentAt = list[list.length - 1].sent_at
    const ok = list.filter(r => !r.error)
    const sentMembers = new Set(ok.map(r => r.member_id).filter((id): id is string => !!id))
    // Judge invites and one-off sends have no member to count by.
    const sentCount = sentMembers.size || new Set(ok.map(r => r.recipient_email)).size

    let expected: MemberLite[] | null = null
    if (ALL_MEMBER_TYPES.has(type)) {
      expected = members.filter(m =>
        m.status === 'active' &&
        !m.email.endsWith('@privacy.wcc.local') &&
        // Timestamps vary in fractional precision, so compare as dates, not strings.
        new Date(m.created_at) <= new Date(firstSentAt),
      )
    } else if (type === 'results_notification') {
      expected = members.filter(m => entrantIds.has(m.id) && !m.email.endsWith('@privacy.wcc.local'))
    }

    const notSent = expected?.filter(m => !sentMembers.has(m.id)).map(member => ({
      member,
      error: list.find(r => r.member_id === member.id && r.error)?.error ?? null,
    })) ?? null

    groups.push({ type, rows: list, firstSentAt, sentCount, notSent })
  }

  return groups.sort((a, b) => new Date(a.firstSentAt).getTime() - new Date(b.firstSentAt).getTime())
}
