import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  submission_invite: 'Submission invite',
  submission_reminder: 'Reminder',
  submission_confirmation: 'Confirmation',
  deadline_reminder: 'Deadline reminder',
  judging_invite: 'Judge invite',
  results_notification: 'Results',
  member_history_link: 'Portal link',
  member_details_changed: 'Email changed notice',
  subs_reminder: 'Subs reminder',
  one_off: 'One-off',
  new_application: 'New application',
  application_received: 'Application received',
  judge_availability_invite: 'Judge availability request',
  judge_availability_reminder: 'Judge availability reminder',
  judge_availability_confirmation: 'Judge availability response',
  judge_availability_admin_notice: 'Judge removed (admin notice)',
}

// Competition emails that go to every active member, so anyone active (and
// already a member) when the send went out but missing from it was skipped.
const ALL_MEMBER_TYPES = new Set(['submission_invite', 'submission_reminder', 'deadline_reminder'])

export interface EmailRow {
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

export interface MemberLite {
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

// Rows a bulk run created up front and never got to carry this error prefix.
export const isNotSent = (error: string | null) => !!error && error.startsWith('Not sent')

export function EmailRowItem({ e, title, subtitle }: {
  e: Pick<EmailRow, 'id' | 'type' | 'recipient_email' | 'sent_at' | 'error'> & { body?: string | null }
  title: string
  subtitle: string
}) {
  const [open, setOpen] = useState(false)
  // Bulk-run listings leave bodies out to stay light; fetch one when opened.
  const { data: lazyBody } = useQuery({
    queryKey: ['email-body', e.id],
    enabled: open && e.body === undefined,
    queryFn: async () => (await apiFetch<{ body: string | null }>(`/api/email-log/${e.id}/body`)).body,
  })
  const body = e.body === undefined ? lazyBody : e.body
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
            {e.error && (
              <span className="text-xs text-red-500 shrink-0">{isNotSent(e.error) ? '⚠ Not sent' : '⚠ Failed'}</span>
            )}
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
          {body && (
            <div
              className="text-gray-700 text-sm prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: body }}
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
    queryFn: () => apiFetch<EmailRow[]>(`/api/members/${memberId}/email-log`),
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
      const [log, members] = await Promise.all([
        apiFetch<{ rows: EmailRow[]; entrantIds: string[] }>(`/api/competitions/${competitionId}/email-log`),
        apiFetch<MemberLite[]>('/api/members'),
      ])
      return { rows: log.rows, members, entrantIds: new Set(log.entrantIds) }
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
                          {error && !isNotSent(error) && <span className="text-red-500"> — failed: {error}</span>}
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
          "Not sent" lists members a send never reached or failed for. For sends logged before
          recipient tracking, it's inferred: members active now who had joined before the email
          first went out (results: members with entries).
        </p>
      )}
    </div>
  )
}

/**
 * Members who should have had this email but have no successful send:
 * anyone a bulk run logged as unsent or failed, plus — for sends logged
 * before runs recorded their audience — active members who had joined by the
 * first send (all-member emails) or entrants (results). Null where neither applies.
 */
export function findNotSent(
  type: string,
  rows: Pick<EmailRow, 'member_id' | 'error'>[],
  firstSentAt: string,
  members: MemberLite[],
  entrantIds: Set<string>,
): Array<{ member: MemberLite; error: string | null }> | null {
  const sentMembers = new Set(rows.filter(r => !r.error).map(r => r.member_id).filter((id): id is string => !!id))
  const expected = new Set(rows.map(r => r.member_id).filter((id): id is string => !!id))
  const inferred = ALL_MEMBER_TYPES.has(type) || type === 'results_notification'

  if (ALL_MEMBER_TYPES.has(type)) {
    for (const m of members) {
      if (
        m.status === 'active' &&
        !m.email.endsWith('@privacy.wcc.local') &&
        // Timestamps vary in fractional precision, so compare as dates, not strings.
        new Date(m.created_at) <= new Date(firstSentAt)
      ) expected.add(m.id)
    }
  } else if (type === 'results_notification') {
    for (const m of members) {
      if (entrantIds.has(m.id) && !m.email.endsWith('@privacy.wcc.local')) expected.add(m.id)
    }
  }

  const missing = members
    .filter(m => expected.has(m.id) && !sentMembers.has(m.id))
    .map(member => ({
      member,
      error: rows.find(r => r.member_id === member.id && r.error)?.error ?? null,
    }))
  if (!inferred && missing.length === 0) return null
  return missing
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

    const notSent = findNotSent(type, list, firstSentAt, members, entrantIds)
    groups.push({ type, rows: list, firstSentAt, sentCount, notSent })
  }

  return groups.sort((a, b) => new Date(a.firstSentAt).getTime() - new Date(b.firstSentAt).getTime())
}
