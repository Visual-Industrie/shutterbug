import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Navigate } from 'react-router-dom'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SettingRow {
  key: string
  section: string
  label: string
  value: string | null
  default_value: string | null
  description: string | null
}

interface CommitteeRole {
  id: string
  name: string
  is_officer: boolean
  sort_order: number
}

interface CommitteeMember {
  id: string
  member_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  membership_number: string | null
  role_id: string
  role_name: string
  is_officer: boolean
  sort_order: number
  starts_at: string
  ends_at: string | null
  notes: string | null
  has_login: boolean
}

interface MemberOption {
  id: string
  first_name: string
  last_name: string
  email: string
  membership_number: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'comp',         label: 'Competition Defaults', roles: null },
  { id: 'committee',    label: 'Committee',            roles: null },
  { id: 'subs',         label: 'Subscriptions',        roles: null },
  { id: 'integrations', label: 'Integrations',         roles: ['super_admin', 'competition_secretary', 'president'] },
]

const COMP_POINTS_KEYS = [
  'COMP-Points Honours',
  'COMP-Points Highly Commended',
  'COMP-Points Commended',
  'COMP-Points Accepted',
] as const

const COMP_LIMIT_KEYS = [
  'COMP-Upload Limit PROJIM',
  'COMP-Upload Limit PRINTIM',
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function memberName(m: Pick<CommitteeMember, 'first_name' | 'last_name' | 'membership_number'>) {
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || '(Unknown member)'
  return m.membership_number ? `${name} (#${m.membership_number})` : name
}

// ── Google Drive Panel ────────────────────────────────────────────────────────

interface DriveStatus { connected: boolean; email?: string | null; updatedAt?: string | null; via?: string }

function GoogleDrivePanel() {
  const queryClient = useQueryClient()
  const params = new URLSearchParams(window.location.search)
  const urlError = params.get('error')
  const urlConnected = params.get('connected')

  const { data: status, isLoading } = useQuery<DriveStatus>({
    queryKey: ['google-drive-status'],
    queryFn: () => apiFetch<DriveStatus>('/api/integrations/google/status'),
  })

  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(
    urlConnected ? { text: 'Google Drive connected successfully.', ok: true }
    : urlError ? { text: `Connection failed: ${urlError}`, ok: false }
    : null
  )

  const connect = useCallback(async () => {
    setConnecting(true)
    setMsg(null)
    try {
      const { url } = await apiFetch<{ url: string }>('/api/integrations/google/start')
      window.location.href = url
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Failed to start OAuth flow', ok: false })
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (!confirm('Disconnect Google Drive? Uploads will stop working until reconnected.')) return
    setDisconnecting(true)
    try {
      await apiFetch('/api/integrations/google', { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['google-drive-status'] })
      setMsg({ text: 'Google Drive disconnected.', ok: true })
    } catch {
      setMsg({ text: 'Failed to disconnect.', ok: false })
    } finally {
      setDisconnecting(false)
    }
  }, [queryClient])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Google Drive</h2>
            <p className="text-sm text-gray-500 mt-0.5">Used to store competition entry images.</p>
          </div>
          <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            isLoading ? 'bg-gray-100 text-gray-400'
            : status?.connected ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
          }`}>
            {isLoading ? 'Checking…' : status?.connected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        {status?.connected && (
          <div className="text-sm text-gray-600 mb-4 space-y-1">
            {status.email && <div><span className="text-gray-400">Account:</span> {status.email}</div>}
            {status.updatedAt && (
              <div><span className="text-gray-400">Authorised:</span> {new Date(status.updatedAt).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            )}
            {status.via === 'env' && (
              <div className="text-amber-600 text-xs mt-2">Using token from environment variable. Connect via OAuth to manage it here.</div>
            )}
          </div>
        )}

        {msg && (
          <div className={`text-sm rounded-lg px-4 py-3 mb-4 ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={connect}
            disabled={connecting}
            className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {connecting ? 'Redirecting…' : status?.connected ? 'Re-authorise' : 'Connect Google Drive'}
          </button>
          {status?.connected && status.via !== 'env' && (
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          After connecting, add <code className="bg-gray-100 px-1 rounded">{window.location.origin}/api/integrations/google/callback</code> as an authorised redirect URI in Google Cloud Console.
        </p>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('tab') ?? 'comp'
  })

  // ── Competition defaults state ─────────────────────────────────────────────
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [compSaved, setCompSaved] = useState(false)

  const { data: rows = [], isLoading: compLoading, error: compError } = useQuery<SettingRow[]>({
    queryKey: ['settings', 'comp'],
    queryFn: () => apiFetch<SettingRow[]>('/api/settings?section=COMP'),
  })

  // Initialise draft when rows first arrive
  useEffect(() => {
    if (rows.length > 0) {
      const initial: Record<string, string> = {}
      rows.forEach(r => { initial[r.key] = r.value ?? r.default_value ?? '' })
      setDraft(initial)
    }
  }, [rows])

  const saveSettingsMutation = useMutation({
    mutationFn: (draft: Record<string, string>) =>
      apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(draft) }),
    onSuccess: () => {
      setCompSaved(true)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  function rowFor(key: string) { return rows.find(r => r.key === key) }
  function setDraftKey(key: string, val: string) { setCompSaved(false); setDraft(d => ({ ...d, [key]: val })) }

  async function handleCompSave(e: React.FormEvent) {
    e.preventDefault()
    setCompSaved(false)
    saveSettingsMutation.mutate(draft)
  }

  // ── Committee state ────────────────────────────────────────────────────────
  const [showFormer, setShowFormer] = useState(false)

  // New role input
  const [newRoleName, setNewRoleName] = useState('')

  // Add member modal
  const [showAdd, setShowAdd] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null)
  const [addRoleId, setAddRoleId] = useState('')
  const [addStartsAt, setAddStartsAt] = useState(today())
  const [addNotes, setAddNotes] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  // Edit member modal
  const [editTarget, setEditTarget] = useState<CommitteeMember | null>(null)
  const [editRoleId, setEditRoleId] = useState('')
  const [editStartsAt, setEditStartsAt] = useState('')
  const [editEndsAt, setEditEndsAt] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  // Subs reminder state
  const [subsWorking, setSubsWorking] = useState(false)
  const [subsResult, setSubsResult] = useState<{ sent: number; skipped: number; type: string } | null>(null)
  const [subsError, setSubsError] = useState<string | null>(null)

  // Grant Login modal
  const [grantTarget, setGrantTarget] = useState<CommitteeMember | null>(null)
  const [grantRole, setGrantRole] = useState('committee')
  const [grantError, setGrantError] = useState<string | null>(null)
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null)

  const { data: committeeData, isLoading: committeeLoading } = useQuery<{ roles: CommitteeRole[]; members: CommitteeMember[] }>({
    queryKey: ['committee'],
    queryFn: async () => {
      const [rolesData, membersData] = await Promise.all([
        apiFetch<CommitteeRole[]>('/api/committee/roles'),
        apiFetch<CommitteeMember[]>('/api/committee/members'),
      ])
      return { roles: rolesData, members: membersData }
    },
    enabled: tab === 'committee',
  })

  const roles = committeeData?.roles ?? []
  const members = committeeData?.members ?? []

  const addRoleMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch('/api/committee/roles', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => {
      setNewRoleName('')
      queryClient.invalidateQueries({ queryKey: ['committee'] })
    },
  })

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/committee/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['committee'] }),
  })

  const addMemberMutation = useMutation({
    mutationFn: (body: { member_id: string | null; role_id: string; starts_at: string; notes: string }) =>
      apiFetch('/api/committee/members', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setShowAdd(false)
      queryClient.invalidateQueries({ queryKey: ['committee'] })
    },
    onError: (err) => setAddError(err instanceof Error ? err.message : 'Failed'),
  })

  const editMemberMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role_id: string; starts_at: string; ends_at: string | null; notes: string } }) =>
      apiFetch(`/api/committee/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditTarget(null)
      queryClient.invalidateQueries({ queryKey: ['committee'] })
    },
    onError: (err) => setEditError(err instanceof Error ? err.message : 'Failed'),
  })

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/committee/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['committee'] }),
  })

  const grantLoginMutation = useMutation({
    mutationFn: ({ member_id, admin_role }: { member_id: string; admin_role: string }) =>
      apiFetch('/api/auth/invite', { method: 'POST', body: JSON.stringify({ member_id, admin_role }) }),
    onSuccess: (_, vars) => {
      const target = members.find(m => m.member_id === vars.member_id)
      setGrantSuccess(`Invite sent to ${target?.email ?? 'member'}`)
      setGrantTarget(null)
      queryClient.invalidateQueries({ queryKey: ['committee'] })
    },
    onError: (err) => setGrantError(err instanceof Error ? err.message : 'Failed'),
  })

  function openGrantLogin(m: CommitteeMember) {
    setGrantTarget(m)
    setGrantRole('committee')
    setGrantError(null)
    setGrantSuccess(null)
  }

  async function sendSubsReminder(type: 'first' | 'second') {
    if (!confirm(`Send ${type} subs reminder to all active members with unpaid subs?`)) return
    setSubsWorking(true)
    setSubsResult(null)
    setSubsError(null)
    try {
      const result = await apiFetch<{ sent: number; skipped: number }>('/api/email/subs-reminder', {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      setSubsResult({ ...result, type })
    } catch (err) {
      setSubsError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubsWorking(false)
    }
  }

  // Guard — must come after all hooks
  const allowedRoles = ['super_admin', 'competition_secretary', 'president', 'treasurer']
  if (!user?.role || !allowedRoles.includes(user.role)) return <Navigate to="/" replace />

  // Member search
  async function searchMembers(q: string) {
    if (!q.trim()) { setMemberOptions([]); return }
    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, membership_number')
      .ilike('last_name', `%${q}%`)
      .eq('status', 'active')
      .order('last_name')
      .limit(20)
    setMemberOptions((data ?? []) as MemberOption[])
  }

  async function addRole() {
    if (!newRoleName.trim()) return
    addRoleMutation.mutate(newRoleName.trim())
  }

  async function deleteRole(id: string, name: string) {
    if (!confirm(`Delete role "${name}"? This cannot be undone.`)) return
    deleteRoleMutation.mutate(id)
  }

  function openAdd() {
    setSelectedMember(null); setMemberSearch(''); setMemberOptions([])
    setAddRoleId(roles[0]?.id ?? ''); setAddStartsAt(today()); setAddNotes(''); setAddError(null)
    setShowAdd(true)
  }

  async function handleAdd() {
    if (!addRoleId) { setAddError('Please select a role'); return }
    setAddError(null)
    addMemberMutation.mutate({ member_id: selectedMember?.id ?? null, role_id: addRoleId, starts_at: addStartsAt, notes: addNotes })
  }

  function openEdit(m: CommitteeMember) {
    setEditTarget(m); setEditRoleId(m.role_id); setEditStartsAt(m.starts_at)
    setEditEndsAt(m.ends_at ?? ''); setEditNotes(m.notes ?? ''); setEditError(null)
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditError(null)
    editMemberMutation.mutate({
      id: editTarget.id,
      body: { role_id: editRoleId, starts_at: editStartsAt, ends_at: editEndsAt || null, notes: editNotes },
    })
  }

  async function endToday(m: CommitteeMember) {
    if (!confirm(`Mark ${memberName(m)} as stepping down today?`)) return
    editMemberMutation.mutate({
      id: m.id,
      body: { role_id: m.role_id, starts_at: m.starts_at, ends_at: today(), notes: m.notes ?? '' },
    })
  }

  async function deleteMember(m: CommitteeMember) {
    if (!confirm(`Delete this record for ${memberName(m)}? This cannot be undone.`)) return
    deleteMemberMutation.mutate(m.id)
  }

  const current = members.filter(m => !m.ends_at)
  const former  = members.filter(m => m.ends_at).sort((a, b) => (b.ends_at ?? '').localeCompare(a.ends_at ?? ''))

  // ── Shared input style ─────────────────────────────────────────────────────
  const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
  const numCls   = 'w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.filter(t => !t.roles || t.roles.includes(user!.role)).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Competition Defaults tab ── */}
      {tab === 'comp' && (
        compLoading ? <div className="text-sm text-gray-400">Loading…</div> : (
          <form onSubmit={handleCompSave} className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Points</h2>
              <p className="text-xs text-gray-400 mb-4">Default points pre-filled when creating a new competition. Each competition can override these.</p>
              <div className="space-y-3">
                {COMP_POINTS_KEYS.map(key => {
                  const row = rowFor(key)
                  if (!row) return null
                  return (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm text-gray-800">{row.label.replace('Points: ', '')}</div>
                        {row.description && <div className="text-xs text-gray-400">{row.description}</div>}
                      </div>
                      <input type="number" min={0} max={99} value={draft[key] ?? ''} onChange={e => setDraftKey(key, e.target.value)} className={numCls} />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Entry limits</h2>
              <p className="text-xs text-gray-400 mb-4">Default maximum entries per member per competition.</p>
              <div className="space-y-3">
                {COMP_LIMIT_KEYS.map(key => {
                  const row = rowFor(key)
                  if (!row) return null
                  return (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm text-gray-800">{row.label.replace('Upload Limit ', '')}</div>
                        {row.description && <div className="text-xs text-gray-400">{row.description}</div>}
                      </div>
                      <input type="number" min={0} max={10} value={draft[key] ?? ''} onChange={e => setDraftKey(key, e.target.value)} className={numCls} />
                    </div>
                  )
                })}
              </div>
            </div>

            {compError && <p className="text-sm text-red-600">{(compError as Error).message}</p>}
            {saveSettingsMutation.error && <p className="text-sm text-red-600">{(saveSettingsMutation.error as Error).message}</p>}
            {compSaved && <p className="text-sm text-green-600">Settings saved.</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={saveSettingsMutation.isPending} className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>
        )
      )}

      {/* ── Committee tab ── */}
      {tab === 'committee' && (
        committeeLoading ? <div className="text-sm text-gray-400">Loading…</div> : (
          <div className="space-y-6">

            {/* Roles */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Roles</h2>
              <div className="space-y-1.5 mb-4">
                {roles.map(r => (
                  <div key={r.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800">{r.name}</span>
                      {r.is_officer && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">Officer</span>}
                    </div>
                    <button
                      onClick={() => deleteRole(r.id, r.name)}
                      className="text-xs text-gray-300 hover:text-red-500 transition-colors px-1"
                      title="Delete role"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New role name…"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRole())}
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={addRole}
                  disabled={!newRoleName.trim() || addRoleMutation.isPending}
                  className="px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Current committee */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">Current committee ({current.length})</h2>
                <button onClick={openAdd} className="px-3 py-1.5 text-sm bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 transition-colors">
                  + Add member
                </button>
              </div>
              {current.length === 0 ? (
                <p className="text-sm text-gray-400">No current committee members.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Name</th>
                        <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Role</th>
                        <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Since</th>
                        <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Notes</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {current.map(m => (
                        <tr key={m.id}>
                          <td className="py-2.5 pr-4 text-gray-900">{memberName(m)}</td>
                          <td className="py-2.5 pr-4 text-gray-600">
                            {m.role_name}
                            {m.is_officer && <span className="ml-1.5 text-xs text-amber-600">★</span>}
                          </td>
                          <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{fmtDate(m.starts_at)}</td>
                          <td className="py-2.5 pr-4 text-gray-400 text-xs max-w-[12rem] truncate">{m.notes ?? ''}</td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {m.member_id && (
                              m.has_login
                                ? <span className="text-xs text-green-600 mr-3">✓ Has login</span>
                                : <button onClick={() => openGrantLogin(m)} className="text-xs text-blue-500 hover:text-blue-700 transition-colors mr-3">Grant Login</button>
                            )}
                            <button onClick={() => openEdit(m)} className="text-xs text-gray-400 hover:text-amber-700 transition-colors mr-3">Edit</button>
                            <button onClick={() => endToday(m)} className="text-xs text-gray-400 hover:text-orange-600 transition-colors mr-3">End</button>
                            <button onClick={() => deleteMember(m)} className="text-xs text-gray-300 hover:text-red-500 transition-colors">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Former committee */}
            {former.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <button
                  onClick={() => setShowFormer(v => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h2 className="text-sm font-semibold text-gray-700">Former committee ({former.length})</h2>
                  <span className="text-xs text-gray-400">{showFormer ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {showFormer && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Name</th>
                          <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">Role</th>
                          <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">From</th>
                          <th className="text-left py-2 pr-4 font-medium text-gray-500 text-xs">To</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {former.map(m => (
                          <tr key={m.id} className="text-gray-500">
                            <td className="py-2.5 pr-4">{memberName(m)}</td>
                            <td className="py-2.5 pr-4">{m.role_name}</td>
                            <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(m.starts_at)}</td>
                            <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(m.ends_at)}</td>
                            <td className="py-2.5 text-right whitespace-nowrap">
                              <button onClick={() => openEdit(m)} className="text-xs text-gray-400 hover:text-amber-700 transition-colors mr-3">Edit</button>
                              <button onClick={() => deleteMember(m)} className="text-xs text-gray-300 hover:text-red-500 transition-colors">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Add member modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Add committee member</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Member search */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Member (search by last name)</label>
                <input
                  type="text"
                  placeholder="Start typing…"
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
                        {m.membership_number && <span className="text-gray-400 ml-1.5">#{m.membership_number}</span>}
                        <span className="text-gray-400 ml-1.5 text-xs">{m.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedMember && (
                  <p className="mt-1 text-xs text-green-600">✓ {selectedMember.first_name} {selectedMember.last_name} selected</p>
                )}
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={addRoleId} onChange={e => setAddRoleId(e.target.value)} className={inputCls}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_officer ? ' ★' : ''}</option>)}
                </select>
              </div>

              {/* Start date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                <input type="date" value={addStartsAt} onChange={e => setAddStartsAt(e.target.value)} className={inputCls} />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)} className={inputCls} placeholder="e.g. Co-opted mid-year" />
              </div>

              {addError && <p className="text-sm text-red-600">{addError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAdd} disabled={addMemberMutation.isPending} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {addMemberMutation.isPending ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subscriptions tab ── */}
      {tab === 'subs' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Annual subscription reminders</h2>
            <p className="text-xs text-gray-400 mb-5">Send reminder emails to all active members who have not yet paid their subscription. These are typically sent in mid-December and mid-January.</p>

            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-medium text-gray-800">1st reminder</div>
                  <div className="text-xs text-gray-400 mt-0.5">Sent ~December 13 — gentle reminder that subs are due for the new year</div>
                </div>
                <button
                  onClick={() => sendSubsReminder('first')}
                  disabled={subsWorking}
                  className="shrink-0 px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {subsWorking ? 'Sending…' : 'Send now'}
                </button>
              </div>

              <div className="flex items-start justify-between gap-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">2nd reminder</div>
                  <div className="text-xs text-gray-400 mt-0.5">Sent ~January 13 — final reminder before grace period ends</div>
                </div>
                <button
                  onClick={() => sendSubsReminder('second')}
                  disabled={subsWorking}
                  className="shrink-0 px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {subsWorking ? 'Sending…' : 'Send now'}
                </button>
              </div>
            </div>

            {subsError && <p className="mt-3 text-sm text-red-600">{subsError}</p>}
            {subsResult && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                {subsResult.type === 'first' ? '1st' : '2nd'} reminder sent to {subsResult.sent} member{subsResult.sent !== 1 ? 's' : ''}.
                {subsResult.skipped > 0 && ` ${subsResult.skipped} skipped.`}
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <p className="font-medium mb-1">Automated scheduling</p>
            <p>These reminders can also run automatically via GitHub Actions on Dec 13 and Jan 13. See <code>.github/workflows/subs-reminders.yml</code> — requires <code>APP_URL</code> and <code>CRON_SECRET</code> secrets.</p>
          </div>
        </div>
      )}

      {/* ── Grant Login modal ── */}
      {grantTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGrantTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Grant admin login</h2>
                <p className="text-xs text-gray-400 mt-0.5">{memberName(grantTarget)}</p>
              </div>
              <button onClick={() => setGrantTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Admin role</label>
                <select value={grantRole} onChange={e => setGrantRole(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="committee">Committee</option>
                  <option value="competition_secretary">Competition Secretary</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="president">President</option>
                </select>
              </div>
              <p className="text-xs text-gray-400">An invite email will be sent to <strong>{grantTarget.email}</strong> with a link to set their password.</p>
              {grantError && <p className="text-sm text-red-600">{grantError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setGrantTarget(null)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={() => { if (grantTarget.member_id) { setGrantError(null); grantLoginMutation.mutate({ member_id: grantTarget.member_id, admin_role: grantRole }) } }}
                disabled={grantLoginMutation.isPending}
                className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {grantLoginMutation.isPending ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grant Login success toast ── */}
      {grantSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-700 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-3">
          <span>{grantSuccess}</span>
          <button onClick={() => setGrantSuccess(null)} className="text-white/70 hover:text-white leading-none">&times;</button>
        </div>
      )}

      {/* ── Edit member modal ── */}
      {/* ── Integrations tab ── */}
      {tab === 'integrations' && <GoogleDrivePanel />}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Edit committee record</h2>
                <p className="text-xs text-gray-400 mt-0.5">{memberName(editTarget)}</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={editRoleId} onChange={e => setEditRoleId(e.target.value)} className={inputCls}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.is_officer ? ' ★' : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                  <input type="date" value={editStartsAt} onChange={e => setEditStartsAt(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End date <span className="text-gray-400">(leave blank if current)</span></label>
                  <input type="date" value={editEndsAt} onChange={e => setEditEndsAt(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} className={inputCls} />
              </div>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button onClick={() => setEditTarget(null)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleEdit} disabled={editMemberMutation.isPending} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {editMemberMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
