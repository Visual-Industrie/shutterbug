import { useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface CompDetail {
  id: string
  name: string
  event_type: string
  status: string
  opens_at: string | null
  closes_at: string | null
  judging_opens_at: string | null
  judging_closes_at: string | null
  max_projim_entries: number
  max_printim_entries: number
  points_honours: number
  points_highly_commended: number
  points_commended: number
  points_accepted: number
  seasons: { year: number } | null
  competition_judges: Array<{ judges: { id: string; name: string; email: string } | null }>
}

interface CompForm {
  name: string
  event_type: string
  opens_at: string
  closes_at: string
  judging_opens_at: string
  judging_closes_at: string
  max_projim_entries: number
  max_printim_entries: number
  points_honours: number
  points_highly_commended: number
  points_commended: number
  points_accepted: number
}

interface EntrySummary {
  type: string
  award: string | null
  count: number
}

interface AdminEntry {
  id: string
  type: string
  title: string
  drive_file_url: string | null
  drive_thumbnail_url: string | null
  award: string | null
  submitted_at: string
  member_id: string
  first_name: string
  last_name: string
  membership_number: string | null
}

interface JudgeOption {
  id: string
  name: string
  email: string
  is_available: boolean
}

const STATUS_FLOW = ['draft', 'open', 'closed', 'judging', 'complete']

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-orange-100 text-orange-700',
  judging: 'bg-blue-100 text-blue-700',
  complete: 'bg-purple-100 text-purple-700',
}

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toDateInput(d: string | null) {
  if (!d) return ''
  return d.split('T')[0]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ActionButton({
  label, onClick, variant = 'primary', disabled = false,
}: {
  label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean
}) {
  const cls = {
    primary: 'bg-amber-600 text-white hover:bg-amber-700',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {label}
    </button>
  )
}

export default function CompetitionDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [working, setWorking] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Edit competition modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<CompForm | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  // Single member invite modal
  const [showSingleInvite, setShowSingleInvite] = useState(false)
  const [memberOptions, setMemberOptions] = useState<{ id: string; first_name: string; last_name: string; email: string }[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [singleInviteSending, setSingleInviteSending] = useState(false)
  const [singleInviteError, setSingleInviteError] = useState<string | null>(null)

  // Assign judge modal
  const [showJudge, setShowJudge] = useState(false)
  const [judgeOptions, setJudgeOptions] = useState<JudgeOption[]>([])
  const [selectedJudgeId, setSelectedJudgeId] = useState('')
  const [judgeSearch, setJudgeSearch] = useState('')
  const [judgeSaving, setJudgeSaving] = useState(false)

  // Manual entry modal
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AdminEntry | null>(null)
  const [entryMemberOptions, setEntryMemberOptions] = useState<{ id: string; first_name: string; last_name: string; membership_number: string | null }[]>([])
  const [entryMemberSearch, setEntryMemberSearch] = useState('')
  const [entryMemberId, setEntryMemberId] = useState('')
  const [entryType, setEntryType] = useState<'projim' | 'printim'>('projim')
  const [entryTitle, setEntryTitle] = useState('')
  const [entryFile, setEntryFile] = useState<File | null>(null)
  const [entryUploading, setEntryUploading] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)
  const entryFileRef = useRef<HTMLInputElement>(null)

  const { data: adminEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ['competition-entries', id],
    queryFn: () => apiFetch<AdminEntry[]>(`/api/competitions/${id}/entries`),
  })

  const { data: judgingTokenData } = useQuery({
    queryKey: ['competition-judging-token', id],
    queryFn: () => apiFetch<{ token: string }>(`/api/competitions/${id}/judging-token`).catch(() => null),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['competition', id],
    queryFn: async () => {
      const { data: comp } = await supabase
        .from('competitions')
        .select(`
          id, name, event_type, status, opens_at, closes_at,
          judging_opens_at, judging_closes_at,
          max_projim_entries, max_printim_entries,
          points_honours, points_highly_commended, points_commended, points_accepted,
          seasons(year),
          competition_judges(judges(id, name, email))
        `)
        .eq('id', id!)
        .single()

      const { data: entryData } = await supabase
        .from('entries')
        .select('type, award')
        .eq('competition_id', id!)

      const counts: Record<string, number> = {}
      for (const e of entryData ?? []) {
        const key = `${e.type}|${e.award ?? 'none'}`
        counts[key] = (counts[key] ?? 0) + 1
      }
      const entries: EntrySummary[] = Object.entries(counts).map(([k, count]) => {
        const [type, award] = k.split('|')
        return { type, award: award === 'none' ? null : award, count }
      })

      return { comp: comp as CompDetail | null, entries }
    },
  })

  const editMutation = useMutation({
    mutationFn: (form: CompForm) =>
      apiFetch(`/api/competitions/${id}`, { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: () => {
      setShowEdit(false)
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
    },
    onError: (err) => {
      setEditError(err instanceof Error ? err.message : 'Something went wrong')
    },
  })

  const comp = data?.comp ?? null
  const entries = data?.entries ?? []

  async function doAction(path: string, label: string) {
    setWorking(true)
    setActionMsg(null)
    try {
      const data = await apiFetch<{ sent?: number; skipped?: number }>(path, { method: 'POST' })
      if (data.sent !== undefined) {
        setActionMsg({ text: `${label}: ${data.sent} sent, ${data.skipped} skipped.`, ok: true })
      } else {
        setActionMsg({ text: `${label}: done.`, ok: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error'
      setActionMsg({ text: `${label} failed: ${msg}`, ok: false })
    } finally {
      setWorking(false)
    }
  }

  async function handleDownload(type: 'all' | 'projim') {
    if (!comp) return
    setDownloading(true)
    setActionMsg(null)
    try {
      const token = localStorage.getItem('sb_admin_token')
      const url = `/api/competitions/${comp.id}/download-entries${type !== 'all' ? `?type=${type}` : ''}`
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const data = await response.json()
        setActionMsg({ text: `Download failed: ${data.error}`, ok: false })
        return
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${comp.name}${type !== 'all' ? ` (${type})` : ''}.zip`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setActionMsg({ text: `Download failed: ${err instanceof Error ? err.message : 'Error'}`, ok: false })
    } finally {
      setDownloading(false)
    }
  }

  async function advanceStatus() {
    if (!comp) return
    const next = STATUS_FLOW[STATUS_FLOW.indexOf(comp.status) + 1]
    if (!next) return
    setWorking(true)
    const { error } = await supabase.from('competitions').update({ status: next }).eq('id', comp.id)
    if (error) {
      setActionMsg({ text: `Failed to advance status: ${error.message}`, ok: false })
    } else {
      setActionMsg({ text: `Status updated to ${next}.`, ok: true })
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
    }
    setWorking(false)
  }

  function openEdit() {
    if (!comp) return
    setEditForm({
      name: comp.name,
      event_type: comp.event_type,
      opens_at: toDateInput(comp.opens_at),
      closes_at: toDateInput(comp.closes_at),
      judging_opens_at: toDateInput(comp.judging_opens_at),
      judging_closes_at: toDateInput(comp.judging_closes_at),
      max_projim_entries: comp.max_projim_entries,
      max_printim_entries: comp.max_printim_entries,
      points_honours: comp.points_honours,
      points_highly_commended: comp.points_highly_commended,
      points_commended: comp.points_commended,
      points_accepted: comp.points_accepted,
    })
    setEditError(null)
    setShowEdit(true)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm) return
    setEditError(null)
    editMutation.mutate(editForm)
  }

  function setEditField<K extends keyof CompForm>(k: K, v: CompForm[K]) {
    setEditForm(prev => prev ? { ...prev, [k]: v } : prev)
  }

  async function openSingleInvite() {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email')
      .eq('status', 'active')
      .not('email', 'like', '%@privacy.wcc.local')
      .order('last_name')
    setMemberOptions((data ?? []) as typeof memberOptions)
    setSelectedMemberId('')
    setMemberSearch('')
    setSingleInviteError(null)
    setShowSingleInvite(true)
  }

  async function handleSingleInvite() {
    if (!selectedMemberId) return
    setSingleInviteSending(true)
    setSingleInviteError(null)
    try {
      await apiFetch(`/api/competitions/${comp!.id}/send-submission-invite-single`, {
        method: 'POST',
        body: JSON.stringify({ memberId: selectedMemberId }),
      })
      setShowSingleInvite(false)
      setActionMsg({ text: 'Invite sent.', ok: true })
    } catch (err) {
      setSingleInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSingleInviteSending(false)
    }
  }

  async function openAssignJudge() {
    const { data } = await supabase.from('judges').select('id,name,email,is_available').order('name')
    setJudgeOptions((data ?? []) as JudgeOption[])
    const current = comp?.competition_judges?.[0]?.judges
    setSelectedJudgeId(current?.id ?? '')
    setJudgeSearch('')
    setShowJudge(true)
  }

  async function handleAssignJudge() {
    if (!comp) return
    setJudgeSaving(true)
    try {
      await apiFetch(`/api/competitions/${comp.id}/judge`, {
        method: 'PUT',
        body: JSON.stringify({ judge_id: selectedJudgeId || null }),
      })
      setShowJudge(false)
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
    } catch {
      // show nothing, just close
    } finally {
      setJudgeSaving(false)
    }
  }

  async function openAddEntry() {
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, membership_number')
      .eq('status', 'active')
      .order('last_name')
    setEntryMemberOptions((data ?? []) as typeof entryMemberOptions)
    setEditingEntry(null)
    setEntryMemberId('')
    setEntryMemberSearch('')
    setEntryType('projim')
    setEntryTitle('')
    setEntryFile(null)
    setEntryError(null)
    setShowAddEntry(true)
  }

  function openEditEntry(entry: AdminEntry) {
    setEditingEntry(entry)
    setEntryMemberId(entry.member_id)
    setEntryType(entry.type as 'projim' | 'printim')
    setEntryTitle(entry.title)
    setEntryFile(null)
    setEntryError(null)
    setShowAddEntry(true)
  }

  async function handleEntrySubmit(e: React.FormEvent) {
    e.preventDefault()
    setEntryError(null)
    if (!editingEntry && !entryMemberId) { setEntryError('Please select a member'); return }
    if (!entryTitle.trim()) { setEntryError('Title is required'); return }

    setEntryUploading(true)
    try {
      if (editingEntry) {
        await apiFetch(`/api/competitions/${id}/entries/${editingEntry.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: entryTitle, type: entryType }),
        })
      } else {
        let driveFileId: string | null = null

        if (entryFile) {
          // Step 1: get Drive resumable upload session
          const sessionRes = await apiFetch<{ uploadUrl: string | null }>(`/api/competitions/${id}/entries/session`, {
            method: 'POST',
            body: JSON.stringify({ memberId: entryMemberId, type: entryType, title: entryTitle }),
          })
          if (sessionRes.uploadUrl) {
            // Step 2: upload file directly to Drive
            const uploadRes = await fetch(sessionRes.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': entryFile.type || 'image/jpeg' },
              body: entryFile,
            })
            if (!uploadRes.ok) throw new Error('Image upload to Drive failed')
            const uploadJson = await uploadRes.json().catch(() => null)
            driveFileId = uploadJson?.id ?? null
          }
        }

        // Step 3: finalize — process image + save entry
        await apiFetch(`/api/competitions/${id}/entries`, {
          method: 'POST',
          body: JSON.stringify({ memberId: entryMemberId, type: entryType, title: entryTitle, driveFileId }),
        })
      }
      setShowAddEntry(false)
      refetchEntries()
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setEntryUploading(false)
    }
  }

  async function handleDeleteEntry(entryId: string, memberName: string) {
    if (!confirm(`Remove entry by ${memberName}? This will also delete the image from Drive.`)) return
    try {
      await apiFetch(`/api/competitions/${id}/entries/${entryId}`, { method: 'DELETE' })
      refetchEntries()
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
    } catch (err) {
      setActionMsg({ text: `Delete failed: ${err instanceof Error ? err.message : 'Error'}`, ok: false })
    }
  }

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!comp) return <div className="p-8 text-gray-400">Competition not found.</div>

  const projimTotal = entries.filter(e => e.type === 'projim').reduce((s, e) => s + e.count, 0)
  const printimTotal = entries.filter(e => e.type === 'printim').reduce((s, e) => s + e.count, 0)
  const judge = comp.competition_judges?.[0]?.judges
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(comp.status) + 1]

  const filteredJudges = judgeOptions.filter(j =>
    !judgeSearch || j.name.toLowerCase().includes(judgeSearch.toLowerCase())
  )

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-400 mb-4">
        <Link to="/competitions" className="hover:text-amber-700">Events</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{comp.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{comp.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {comp.seasons?.year} · <span className="capitalize">{comp.event_type}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize ${STATUS_COLORS[comp.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {comp.status}
          </span>
          <button
            onClick={openEdit}
            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${actionMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {actionMsg.text}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Dates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Schedule</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-400">Opens</dt><dd className="text-gray-700">{fmt(comp.opens_at)}</dd>
              <dt className="text-gray-400">Closes</dt><dd className="text-gray-700">{fmt(comp.closes_at)}</dd>
              <dt className="text-gray-400">Judging opens</dt><dd className="text-gray-700">{fmt(comp.judging_opens_at)}</dd>
              <dt className="text-gray-400">Judging closes</dt><dd className="text-gray-700">{fmt(comp.judging_closes_at)}</dd>
            </dl>
          </div>

          {/* Entries summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Entries</h2>
              <button
                onClick={openAddEntry}
                className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                + Add manually
              </button>
            </div>
            <div className="flex gap-6 mb-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{projimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">PROJIM</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{printimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">PRINTIM</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{projimTotal + printimTotal}</div>
                <div className="text-xs text-gray-400 mt-0.5">Total</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 mb-3">
              Limits: {comp.max_projim_entries} PROJIM · {comp.max_printim_entries} PRINTIM per member
            </div>
            {/* Entry list */}
            {adminEntries.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto border-t border-gray-100 pt-3">
                {adminEntries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-xs">
                    {entry.drive_thumbnail_url ? (
                      <img src={entry.drive_thumbnail_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{entry.title}</div>
                      <div className="text-gray-400">{entry.first_name} {entry.last_name} · {entry.type.toUpperCase()}</div>
                    </div>
                    <button
                      onClick={() => openEditEntry(entry)}
                      className="text-gray-400 hover:text-amber-700 transition-colors shrink-0"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteEntry(entry.id, `${entry.first_name} ${entry.last_name}`)}
                      className="text-gray-400 hover:text-red-600 transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Points config */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Points</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-gray-400">Honours</dt><dd className="text-gray-700">{comp.points_honours}</dd>
              <dt className="text-gray-400">Highly Commended</dt><dd className="text-gray-700">{comp.points_highly_commended}</dd>
              <dt className="text-gray-400">Commended</dt><dd className="text-gray-700">{comp.points_commended}</dd>
              <dt className="text-gray-400">Accepted</dt><dd className="text-gray-700">{comp.points_accepted}</dd>
            </dl>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-4">
          {/* Judge */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Judge</h2>
              <button
                onClick={openAssignJudge}
                className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                {judge ? 'Change' : 'Assign'}
              </button>
            </div>
            {judge ? (
              <div>
                <div className="font-medium text-gray-900 text-sm">{judge.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{judge.email}</div>
              </div>
            ) : (
              <div className="text-xs text-red-500">No judge assigned</div>
            )}
            {judgingTokenData?.token && (
              <Link
                to={`/judge/${judgingTokenData.token}/reference`}
                className="mt-3 block text-center text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-amber-700 hover:border-amber-300 transition-colors"
              >
                Open reference view →
              </Link>
            )}
          </div>

          {/* Download entries */}
          {(projimTotal + printimTotal > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Download images</h2>
              <ActionButton
                label={downloading ? 'Downloading…' : 'Download all entries'}
                onClick={() => handleDownload('all')}
                variant="secondary"
                disabled={downloading}
              />
              {projimTotal > 0 && (
                <ActionButton
                  label={downloading ? 'Downloading…' : 'Download PROJIM only'}
                  onClick={() => handleDownload('projim')}
                  variant="secondary"
                  disabled={downloading}
                />
              )}
            </div>
          )}

          {/* Status actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Actions</h2>

            {nextStatus && (
              <ActionButton label={`Advance → ${nextStatus}`} onClick={advanceStatus} disabled={working} />
            )}

            {comp.status === 'open' && (
              <>
                <ActionButton
                  label="Send submission invites"
                  onClick={() => doAction(`/api/competitions/${comp.id}/send-submission-invites`, 'Invites')}
                  variant="secondary"
                  disabled={working}
                />
                <ActionButton
                  label="Invite single member…"
                  onClick={openSingleInvite}
                  variant="secondary"
                  disabled={working}
                />
                <ActionButton
                  label="Send reminders"
                  onClick={() => doAction(`/api/competitions/${comp.id}/send-submission-reminders`, 'Reminders')}
                  variant="secondary"
                  disabled={working}
                />
                <ActionButton
                  label="Send personalised reminders"
                  onClick={() => doAction(`/api/competitions/${comp.id}/send-deadline-reminders`, 'Deadline reminders')}
                  variant="secondary"
                  disabled={working}
                />
              </>
            )}

            {comp.status === 'judging' && judge && (
              <ActionButton
                label="Send judging invite"
                onClick={() => doAction(`/api/competitions/${comp.id}/send-judging-invite`, 'Judging invite')}
                variant="secondary"
                disabled={working}
              />
            )}

            {comp.status === 'complete' && (
              <ActionButton
                label="Send results to members"
                onClick={() => doAction(`/api/competitions/${comp.id}/send-results`, 'Results')}
                variant="secondary"
                disabled={working}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Competition Modal */}
      {showEdit && editForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit event</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Event name *">
                <input type="text" required value={editForm.name} onChange={e => setEditField('name', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Type">
                <select value={editForm.event_type} onChange={e => setEditField('event_type', e.target.value)} className={inputCls}>
                  <option value="competition">Competition</option>
                  <option value="award">Award</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Schedule</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opens">
                    <input type="date" value={editForm.opens_at} onChange={e => setEditField('opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Closes">
                    <input type="date" value={editForm.closes_at} onChange={e => setEditField('closes_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging opens">
                    <input type="date" value={editForm.judging_opens_at} onChange={e => setEditField('judging_opens_at', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Judging closes">
                    <input type="date" value={editForm.judging_closes_at} onChange={e => setEditField('judging_closes_at', e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Entry limits</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max PROJIM">
                    <input type="number" min={0} value={editForm.max_projim_entries} onChange={e => setEditField('max_projim_entries', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Max PRINTIM">
                    <input type="number" min={0} value={editForm.max_printim_entries} onChange={e => setEditField('max_printim_entries', Number(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Points</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Honours">
                    <input type="number" min={0} value={editForm.points_honours} onChange={e => setEditField('points_honours', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Highly Commended">
                    <input type="number" min={0} value={editForm.points_highly_commended} onChange={e => setEditField('points_highly_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Commended">
                    <input type="number" min={0} value={editForm.points_commended} onChange={e => setEditField('points_commended', Number(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Accepted">
                    <input type="number" min={0} value={editForm.points_accepted} onChange={e => setEditField('points_accepted', Number(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>

              {editError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{editError}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={editMutation.isPending} onClick={handleEditSubmit} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {editMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Member Invite Modal */}
      {showSingleInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSingleInvite(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Invite single member</h2>
              <button onClick={() => setShowSingleInvite(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-4">
              <input
                type="search"
                placeholder="Search members…"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="max-h-60 overflow-y-auto space-y-1">
                {memberOptions
                  .filter(m => !memberSearch || `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(m => (
                    <label key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="radio" name="member" value={m.id} checked={selectedMemberId === m.id} onChange={() => setSelectedMemberId(m.id)} className="accent-amber-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{m.first_name} {m.last_name}</div>
                        <div className="text-xs text-gray-400 truncate">{m.email}</div>
                      </div>
                    </label>
                  ))}
              </div>
              {singleInviteError && <p className="mt-3 text-sm text-red-600">{singleInviteError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowSingleInvite(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSingleInvite} disabled={!selectedMemberId || singleInviteSending} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {singleInviteSending ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Entry Modal */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddEntry(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">{editingEntry ? 'Edit entry' : 'Add entry manually'}</h2>
              <button onClick={() => setShowAddEntry(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleEntrySubmit} className="p-4 space-y-4">
              {/* Member selector — only for new entries */}
              {!editingEntry && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Member *</label>
                  <input
                    type="search"
                    placeholder="Search members…"
                    value={entryMemberSearch}
                    onChange={e => setEntryMemberSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-0.5 border border-gray-200 rounded-lg">
                    {entryMemberOptions
                      .filter(m => !entryMemberSearch || `${m.first_name} ${m.last_name} ${m.membership_number ?? ''}`.toLowerCase().includes(entryMemberSearch.toLowerCase()))
                      .map(m => (
                        <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="radio"
                            name="entryMember"
                            value={m.id}
                            checked={entryMemberId === m.id}
                            onChange={() => setEntryMemberId(m.id)}
                            className="accent-amber-600"
                          />
                          <span className="text-sm text-gray-900">{m.first_name} {m.last_name}</span>
                          {m.membership_number && <span className="text-xs text-gray-400">#{m.membership_number}</span>}
                        </label>
                      ))}
                  </div>
                </div>
              )}
              {editingEntry && (
                <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                  {editingEntry.first_name} {editingEntry.last_name}
                  {editingEntry.membership_number && <span className="text-gray-400 ml-1">#{editingEntry.membership_number}</span>}
                </div>
              )}

              {/* Entry type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Type</label>
                <div className="flex gap-2">
                  {(['projim', 'printim'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEntryType(t)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        entryType === t
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={entryTitle}
                  onChange={e => setEntryTitle(e.target.value)}
                  placeholder="e.g. Golden Hour at the Wharf"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* File upload (new entries only) */}
              {!editingEntry && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Image file <span className="text-gray-400">(optional — JPEG or PNG)</span>
                  </label>
                  <input
                    ref={entryFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={e => setEntryFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100"
                  />
                </div>
              )}

              {entryError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{entryError}</div>
              )}
            </form>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowAddEntry(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleEntrySubmit} disabled={entryUploading} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {entryUploading ? 'Saving…' : editingEntry ? 'Save changes' : 'Add entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Judge Modal */}
      {showJudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowJudge(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Assign judge</h2>
              <button onClick={() => setShowJudge(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="p-4">
              <input
                type="search"
                placeholder="Search judges…"
                value={judgeSearch}
                onChange={e => setJudgeSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              <div className="max-h-60 overflow-y-auto space-y-1">
                <label className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="radio" name="judge" value="" checked={selectedJudgeId === ''} onChange={() => setSelectedJudgeId('')} className="accent-amber-600" />
                  <span className="text-sm text-gray-400 italic">No judge</span>
                </label>
                {filteredJudges.map(j => (
                  <label key={j.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="judge" value={j.id} checked={selectedJudgeId === j.id} onChange={() => setSelectedJudgeId(j.id)} className="accent-amber-600" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{j.name}</div>
                      <div className="text-xs text-gray-400 truncate">{j.email}</div>
                    </div>
                    {j.is_available && (
                      <span className="text-xs text-green-600 font-medium shrink-0">Available</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowJudge(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleAssignJudge} disabled={judgeSaving} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {judgeSaving ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
