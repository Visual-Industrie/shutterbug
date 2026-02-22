import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface Applicant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  application_date: string
  annual_sub_amount: string | null
  pay_by_date: string | null
  status: string
}

interface ApplicantForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  annual_sub_amount: string
  pay_by_date: string
  status: string
}

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function Applicants() {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState<Record<string, { text: string; ok: boolean }>>({})

  const [editing, setEditing] = useState<Applicant | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ApplicantForm>({ first_name: '', last_name: '', email: '', phone: '', annual_sub_amount: '', pay_by_date: '', status: 'pending' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('applicants')
      .select('id,first_name,last_name,email,phone,application_date,annual_sub_amount,pay_by_date,status')
      .order('application_date', { ascending: false })
    setApplicants(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function recordPayment(id: string) {
    setWorking(prev => ({ ...prev, [id]: true }))
    try {
      await apiFetch(`/api/applicants/${id}/record-payment`, { method: 'POST' })
      setMsg(prev => ({ ...prev, [id]: { text: 'Converted to member ✓', ok: true } }))
      await load()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Error'
      setMsg(prev => ({ ...prev, [id]: { text, ok: false } }))
    } finally {
      setWorking(prev => ({ ...prev, [id]: false }))
    }
  }

  function openEdit(a: Applicant) {
    setEditing(a)
    setForm({
      first_name: a.first_name,
      last_name: a.last_name,
      email: a.email,
      phone: a.phone ?? '',
      annual_sub_amount: a.annual_sub_amount ?? '',
      pay_by_date: a.pay_by_date ?? '',
      status: a.status,
    })
    setFormError(null)
    setShowModal(true)
  }

  function setField<K extends keyof ApplicantForm>(k: K, v: ApplicantForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    setFormError(null)
    try {
      await apiFetch(`/api/applicants/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) })
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  function statusBadge(s: string) {
    const c: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${c[s] ?? 'bg-gray-100 text-gray-500'}`}>{s}</span>
  }

  function fmt(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applicants</h1>
          <p className="text-sm text-gray-500 mt-0.5">Prospective members awaiting payment</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : applicants.length === 0 ? (
        <div className="text-center text-gray-400 py-8">No applicants</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {applicants.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-gray-900">{a.first_name} {a.last_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{a.email}</div>
                  {a.phone && <div className="text-xs text-gray-400">{a.phone}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  {statusBadge(a.status)}
                  <button
                    onClick={() => openEdit(a)}
                    className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5 mt-3">
                <div><span className="text-gray-400">Applied:</span> {fmt(a.application_date)}</div>
                <div><span className="text-gray-400">Subs:</span> {a.annual_sub_amount ? `$${a.annual_sub_amount}` : '—'}</div>
                <div><span className="text-gray-400">Pay by:</span> {fmt(a.pay_by_date)}</div>
              </div>

              {msg[a.id] && (
                <div className={`mt-3 text-xs px-2 py-1.5 rounded ${msg[a.id].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {msg[a.id].text}
                </div>
              )}

              {a.status === 'pending' && !msg[a.id]?.ok && (
                <button
                  onClick={() => recordPayment(a.id)}
                  disabled={working[a.id]}
                  className="mt-4 w-full py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {working[a.id] ? 'Processing…' : 'Record Payment'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Applicant Modal */}
      {showModal && editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Edit applicant</h2>
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

              <Field label="Phone">
                <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} className={inputCls} />
              </Field>

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Treasurer fields</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Annual subs ($)">
                    <input type="number" min={0} step="0.01" value={form.annual_sub_amount} onChange={e => setField('annual_sub_amount', e.target.value)} className={inputCls} placeholder="0.00" />
                  </Field>
                  <Field label="Pay by date">
                    <input type="date" value={form.pay_by_date} onChange={e => setField('pay_by_date', e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>

              <Field label="Status">
                <select value={form.status} onChange={e => setField('status', e.target.value)} className={inputCls}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </Field>

              {formError && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} onClick={handleSubmit} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
