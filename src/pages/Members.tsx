import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface Member {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  membership_number: string | null
  status: string
  membership_type: string
  subs_paid: boolean
  subs_due_date: string | null
  joined_date: string | null
  experience_level: string | null
  annual_sub_amount: string | null
}

interface MemberForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  membership_number: string
  status: string
  membership_type: string
  experience_level: string
  subs_paid: boolean
  subs_due_date: string
  joined_date: string
  annual_sub_amount: string
}

const EMPTY_FORM: MemberForm = {
  first_name: '', last_name: '', email: '', phone: '',
  membership_number: '', status: 'active', membership_type: 'full',
  experience_level: '', subs_paid: false, subs_due_date: '', joined_date: '',
  annual_sub_amount: '',
}

const STATUS_OPTS = ['all', 'active', 'inactive', 'suspended']
const TYPE_OPTS = ['all', 'full', 'life', 'complimentary']
const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function Members() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [type, setType] = useState('all')
  const [historyMsg, setHistoryMsg] = useState<Record<string, 'sending' | 'sent' | 'err'>>({})

  const [editing, setEditing] = useState<Member | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  const { data: allMembers = [], isLoading } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('id,first_name,last_name,email,phone,membership_number,status,membership_type,subs_paid,subs_due_date,joined_date,experience_level,annual_sub_amount')
        .order('last_name', { ascending: true })
      return data ?? []
    },
  })

  const members = allMembers.filter(m => {
    if (status !== 'all' && m.status !== status) return false
    if (type !== 'all' && m.membership_type !== type) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        m.first_name.toLowerCase().includes(q) ||
        m.last_name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.membership_number === search
      )
    }
    return true
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, form }: { id: string | null; form: MemberForm }) =>
      id
        ? apiFetch(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
        : apiFetch('/api/members', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setShowModal(false)
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    },
  })

  async function sendHistoryLink(id: string) {
    setHistoryMsg(prev => ({ ...prev, [id]: 'sending' }))
    try {
      await apiFetch(`/api/members/${id}/send-history-link`, { method: 'POST' })
      setHistoryMsg(prev => ({ ...prev, [id]: 'sent' }))
    } catch {
      setHistoryMsg(prev => ({ ...prev, [id]: 'err' }))
    }
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(m: Member) {
    setEditing(m)
    setForm({
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email,
      phone: m.phone ?? '',
      membership_number: m.membership_number ?? '',
      status: m.status,
      membership_type: m.membership_type,
      experience_level: m.experience_level ?? '',
      subs_paid: m.subs_paid,
      subs_due_date: m.subs_due_date ?? '',
      joined_date: m.joined_date ?? '',
      annual_sub_amount: m.annual_sub_amount ?? '',
    })
    setFormError(null)
    setShowModal(true)
  }

  function setField<K extends keyof MemberForm>(k: K, v: MemberForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    saveMutation.mutate({ id: editing?.id ?? null, form })
  }

  function statusBadge(s: string) {
    const c: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-gray-100 text-gray-500',
      suspended: 'bg-red-100 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${c[s] ?? 'bg-gray-100 text-gray-500'}`}>{s}</span>
  }

  function typeBadge(t: string) {
    const c: Record<string, string> = {
      life: 'bg-amber-100 text-amber-700',
      complimentary: 'bg-blue-100 text-blue-700',
      full: 'bg-gray-100 text-gray-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${c[t] ?? 'bg-gray-100 text-gray-500'}`}>{t}</span>
  }

  const isPrivate = (email: string) => email.includes('@privacy.wcc.local')

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">{members.length} shown</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          + Add member
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          placeholder="Search name, email, member #…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          {STATUS_OPTS.map(o => <option key={o} value={o}>{o === 'all' ? 'All statuses' : o}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          {TYPE_OPTS.map(o => <option key={o} value={o}>{o === 'all' ? 'All types' : o}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Subs</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No members found</td></tr>
              )}
              {members.map(m => {
                const msg = historyMsg[m.id]
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{m.membership_number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.first_name} {m.last_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {isPrivate(m.email)
                        ? <span className="text-gray-300 text-xs italic">deleted</span>
                        : m.email}
                    </td>
                    <td className="px-4 py-3">{typeBadge(m.membership_type)}</td>
                    <td className="px-4 py-3">{statusBadge(m.status)}</td>
                    <td className="px-4 py-3">
                      {m.subs_paid
                        ? <span className="text-green-600 text-xs font-medium">✓ Paid</span>
                        : <span className="text-orange-500 text-xs font-medium">Unpaid</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {m.joined_date ? new Date(m.joined_date).getFullYear() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(m)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                        >
                          Edit
                        </button>
                        {!isPrivate(m.email) && (
                          <button
                            onClick={() => sendHistoryLink(m.id)}
                            disabled={msg === 'sending' || msg === 'sent'}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:cursor-not-allowed ${
                              msg === 'sent' ? 'border-green-300 text-green-600 bg-green-50' :
                              msg === 'err' ? 'border-red-300 text-red-500 bg-red-50' :
                              'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            {msg === 'sending' ? '…' : msg === 'sent' ? '✓ Sent' : msg === 'err' ? '✗ Error' : 'History link'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Member Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit member' : 'Add member'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name *">
                  <input type="text" required value={form.first_name} onChange={e => setField('first_name', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Last name *">
                  <input type="text" required value={form.last_name} onChange={e => setField('last_name', e.target.value)} className={inputCls} />
                </Field>
              </div>

              <Field label="Email *">
                <input type="email" required value={form.email} onChange={e => setField('email', e.target.value)} className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} className={inputCls} />
                </Field>
                <Field label="Member #">
                  <input type="text" value={form.membership_number} onChange={e => setField('membership_number', e.target.value)} className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select value={form.status} onChange={e => setField('status', e.target.value)} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </Field>
                <Field label="Membership type">
                  <select value={form.membership_type} onChange={e => setField('membership_type', e.target.value)} className={inputCls}>
                    <option value="full">Full</option>
                    <option value="life">Life</option>
                    <option value="complimentary">Complimentary</option>
                  </select>
                </Field>
              </div>

              <Field label="Experience level">
                <select value={form.experience_level} onChange={e => setField('experience_level', e.target.value)} className={inputCls}>
                  <option value="">— not set —</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </Field>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Subscriptions</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Annual sub amount">
                    <input type="number" min={0} step="0.01" value={form.annual_sub_amount} onChange={e => setField('annual_sub_amount', e.target.value)} className={inputCls} placeholder="0.00" />
                  </Field>
                  <Field label="Subs due date">
                    <input type="date" value={form.subs_due_date} onChange={e => setField('subs_due_date', e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={form.subs_paid} onChange={e => setField('subs_paid', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                  Subs paid
                </label>
              </div>

              <Field label="Joined date">
                <input type="date" value={form.joined_date} onChange={e => setField('joined_date', e.target.value)} className={inputCls} />
              </Field>

              {formError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saveMutation.isPending} onClick={handleSubmit} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
