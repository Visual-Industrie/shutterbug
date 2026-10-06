import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  EMAIL_TYPE_LABELS,
  EmailRowItem,
  findNotSent,
  isNotSent,
  type MemberLite,
} from '@/components/admin/EmailLogList'

interface LogRow {
  id: string
  type: string
  member_id: string | null
  competition_id: string | null
  recipient_email: string
  recipient_name: string | null
  subject: string
  body?: string | null
  sent_at: string
  error: string | null
  recipient_count?: number | null
}

// Competition emails that went out one per member before bulk runs were
// logged as a group; those older rows are grouped here by competition + type.
const LEGACY_COMPETITION_RUN_TYPES = new Set([
  'submission_invite', 'submission_reminder', 'deadline_reminder', 'results_notification',
])

type Item =
  | { kind: 'single'; key: string; row: LogRow }
  | {
      kind: 'group'
      key: string
      type: string
      title: string
      latestAt: string
      sentCount: number
      /** Null where nobody can be counted as missed (e.g. legacy subs reminders). */
      notSent: { names: string[]; unnamed: number } | null
      /** Shared body of a one-off group send; per-member bodies load on demand. */
      body: string | null
      summaryError: string | null
      recipients: LogRow[]
    }

function fmt(d: string) {
  return new Date(d).toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * The club-wide email log: one-to-one emails as rows, and every bulk send —
 * competition emails, subs reminders, one-off group emails — as an accordion
 * showing how many it reached and who it missed.
 */
export default function EmailActivityList() {
  const [search, setSearch] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  // Top-level rows only: a bulk run's per-member rows hang off its summary row
  // via batch_id and are loaded separately.
  const { data: topRows = [], isLoading } = useQuery({
    queryKey: ['emails'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_log')
        .select('id,type,member_id,competition_id,recipient_email,recipient_name,subject,body,sent_at,error,recipient_count')
        .is('batch_id', null)
        .order('sent_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as LogRow[]
    },
  })

  const batchIds = topRows.filter(r => r.recipient_count != null).map(r => r.id)

  const { data: children = [] } = useQuery({
    queryKey: ['email-batch-members', batchIds],
    enabled: batchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_log')
        .select('id,batch_id,type,member_id,competition_id,recipient_email,recipient_name,subject,sent_at,error')
        .in('batch_id', batchIds)
        .order('recipient_name')
      if (error) throw error
      return (data ?? []) as (LogRow & { batch_id: string })[]
    },
  })

  const compIds = [...new Set(topRows.map(r => r.competition_id).filter((id): id is string => !!id))]

  // Names for group titles, plus what's needed to infer who older,
  // un-grouped competition sends missed.
  const { data: context } = useQuery({
    queryKey: ['email-log-context', compIds],
    queryFn: async () => {
      const [comps, members, entries] = await Promise.all([
        compIds.length
          ? supabase.from('competitions').select('id,name').in('id', compIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('members').select('id,first_name,last_name,status,email,created_at').order('last_name').order('first_name'),
        compIds.length
          ? supabase.from('entries').select('member_id,competition_id').in('competition_id', compIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (comps.error) throw comps.error
      if (members.error) throw members.error
      if (entries.error) throw entries.error
      const entrants = new Map<string, Set<string>>()
      for (const e of (entries.data ?? []) as { member_id: string; competition_id: string }[]) {
        const set = entrants.get(e.competition_id) ?? new Set<string>()
        set.add(e.member_id)
        entrants.set(e.competition_id, set)
      }
      return {
        compNames: new Map(((comps.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])),
        members: (members.data ?? []) as MemberLite[],
        entrants,
      }
    },
  })

  const items = buildItems(topRows, children, context)

  const q = search.trim().toLowerCase()
  const visible = q
    ? items.filter(item => {
        const matches = (r: LogRow) =>
          r.subject.toLowerCase().includes(q) ||
          r.recipient_email.toLowerCase().includes(q) ||
          (r.recipient_name ?? '').toLowerCase().includes(q)
        return item.kind === 'single'
          ? matches(item.row)
          : item.title.toLowerCase().includes(q) || item.recipients.some(matches)
      })
    : items

  return (
    <>
      <input
        type="search"
        placeholder="Search subject, recipient…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
      />

      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No emails logged yet</div>
      ) : (
        <div className="space-y-1">
          {visible.map(item =>
            item.kind === 'single' ? (
              <div key={item.key} className="bg-white rounded-xl">
                <EmailRowItem
                  e={item.row}
                  title={item.row.subject}
                  subtitle={item.row.recipient_name ?? item.row.recipient_email}
                />
              </div>
            ) : (
              <GroupItem
                key={item.key}
                item={item}
                open={openKey === item.key}
                onToggle={() => setOpenKey(openKey === item.key ? null : item.key)}
              />
            ),
          )}
        </div>
      )}
    </>
  )
}

function GroupItem({ item, open, onToggle }: { item: Extract<Item, { kind: 'group' }>; open: boolean; onToggle: () => void }) {
  const notSentCount = item.notSent ? item.notSent.names.length + item.notSent.unnamed : 0
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-gray-900 truncate">{item.title}</div>
          <div className="flex items-center gap-3 text-xs mt-0.5">
            <span className="text-green-700">{item.sentCount} sent</span>
            {notSentCount > 0 && <span className="text-red-600">{notSentCount} not sent</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400">{fmt(item.latestAt)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{EMAIL_TYPE_LABELS[item.type] ?? item.type}</div>
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-3">
          {notSentCount > 0 && item.notSent && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-red-800 mb-1">Not sent</p>
              <p className="text-xs text-red-700">
                {item.notSent.names.join(', ')}
                {item.notSent.unnamed > 0 &&
                  `${item.notSent.names.length ? ', plus ' : ''}${item.notSent.unnamed} not recorded by name (logged before recipient tracking)`}
              </p>
            </div>
          )}
          {item.summaryError && !notSentCount && (
            <div className="text-xs text-red-600 bg-red-50 rounded p-2">{item.summaryError}</div>
          )}
          {item.body && (
            <div
              className="text-gray-700 text-sm prose prose-sm max-w-none border-b border-gray-100 pb-3"
              dangerouslySetInnerHTML={{ __html: item.body }}
            />
          )}
          <div className="space-y-1">
            {item.recipients.map(r => (
              <EmailRowItem
                key={r.id}
                // A one-off group shares one body (shown above); personalised ones load per member.
                e={item.body ? { ...r, body: null } : r}
                title={r.recipient_name ?? r.recipient_email}
                subtitle={r.subject}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildItems(
  topRows: LogRow[],
  children: (LogRow & { batch_id: string })[],
  context: { compNames: Map<string, string>; members: MemberLite[]; entrants: Map<string, Set<string>> } | undefined,
): Item[] {
  const childrenByBatch = new Map<string, LogRow[]>()
  for (const c of children) {
    const list = childrenByBatch.get(c.batch_id)
    if (list) list.push(c)
    else childrenByBatch.set(c.batch_id, [c])
  }

  const items: Item[] = []
  const legacy = new Map<string, LogRow[]>()

  for (const row of topRows) {
    if (row.recipient_count != null) {
      // A logged bulk run: its rows say exactly who was and wasn't reached.
      const recipients = childrenByBatch.get(row.id) ?? []
      const sentCount = recipients.filter(r => !r.error).length
      const names = recipients.filter(r => r.error).map(r => r.recipient_name ?? r.recipient_email)
      // Group sends logged before per-member rows were written up front can
      // be short of rows entirely.
      const unnamed = Math.max(0, row.recipient_count - sentCount - names.length)
      items.push({
        kind: 'group',
        key: row.id,
        type: row.type,
        title: row.subject,
        latestAt: row.sent_at,
        sentCount,
        notSent: { names, unnamed },
        body: row.body ?? null,
        summaryError: row.error,
        recipients,
      })
      continue
    }

    const legacyKey =
      row.competition_id && LEGACY_COMPETITION_RUN_TYPES.has(row.type) ? `${row.competition_id}:${row.type}`
      : row.type === 'subs_reminder' ? `subs:${row.sent_at.slice(0, 10)}`
      : null
    if (!legacyKey) {
      items.push({ kind: 'single', key: row.id, row })
      continue
    }

    const list = legacy.get(legacyKey)
    if (list) {
      list.push(row)
    } else {
      legacy.set(legacyKey, [row])
      // Placeholder at the newest row's position; filled in below.
      items.push({
        kind: 'group', key: legacyKey, type: row.type, title: '', latestAt: row.sent_at,
        sentCount: 0, notSent: null, body: null, summaryError: null, recipients: [],
      })
    }
  }

  return items.map(item => {
    if (item.kind !== 'group' || !legacy.has(item.key)) return item
    const rows = legacy.get(item.key)!
    const ok = rows.filter(r => !r.error)
    const sentCount = new Set(ok.map(r => r.member_id ?? r.recipient_email)).size
    const firstSentAt = rows[rows.length - 1].sent_at
    const compId = rows[0].competition_id
    const label = EMAIL_TYPE_LABELS[item.type] ?? item.type

    let notSent: { names: string[]; unnamed: number } | null = null
    if (compId && context) {
      const missing = findNotSent(item.type, rows, firstSentAt, context.members, context.entrants.get(compId) ?? new Set())
      if (missing) notSent = { names: missing.map(m => `${m.member.first_name} ${m.member.last_name}`), unnamed: 0 }
    }

    return {
      ...item,
      title: compId ? `${label} — ${context?.compNames.get(compId) ?? 'competition'}` : `${label} — ${fmt(firstSentAt).split(',')[0]}`,
      sentCount,
      notSent,
      summaryError: rows.some(r => r.error && !isNotSent(r.error)) ? `${rows.filter(r => r.error).length} failed` : null,
      recipients: rows,
    }
  })
}
