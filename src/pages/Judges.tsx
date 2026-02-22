import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'

interface Judge {
  id: string
  name: string
  email: string
  bio: string | null
  address: string | null
  rating: string | null
  is_available: boolean
}

interface JudgeForm {
  name: string
  email: string
  bio: string
  address: string
  rating: string
  is_available: boolean
}

const EMPTY_FORM: JudgeForm = {
  name: '', email: '', bio: '', address: '', rating: '', is_available: true,
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

function Stars({ rating }: { rating: string | null }) {
  const r = rating ? parseFloat(rating) : 0
  return (
    <span className="text-amber-400 text-xs">
      {'★'.repeat(Math.round(r))}{'☆'.repeat(5 - Math.round(r))}
      {rating && <span className="text-gray-400 ml-1">({rating})</span>}
    </span>
  )
}

export default function Judges() {
  const [judges, setJudges] = useState<Judge[]>([])
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState<Judge | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<JudgeForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let q = supabase
      .from('judges')
      .select('id,name,email,bio,address,rating,is_available')
      .order('name')

    if (onlyAvailable) q = q.eq('is_available', true)
    if (search) q = q.ilike('name', `%${search}%`)

    const { data } = await q
    setJudges(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [search, onlyAvailable])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(j: Judge) {
    setEditing(j)
    setForm({
      name: j.name,
      email: j.email,
      bio: j.bio ?? '',
      address: j.address ?? '',
      rating: j.rating ?? '',
      is_available: j.is_available,
    })
    setFormError(null)
    setShowModal(true)
  }

  function setField<K extends keyof JudgeForm>(k: K, v: JudgeForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await apiFetch(`/api/judges/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) })
      } else {
        await apiFetch('/api/judges', { method: 'POST', body: JSON.stringify(form) })
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Judges</h1>
          <p className="text-sm text-gray-500 mt-0.5">{judges.length} shown</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
        >
          + Add judge
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <input
          type="search"
          placeholder="Search judges…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} className="accent-amber-600" />
          Available only
        </label>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {judges.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-8">No judges found</div>
          )}
          {judges.map(j => (
            <div key={j.id} className="bg-white rounded-xl border border-gray-200 p-4 relative group">
              <div className="flex items-start justify-between mb-2">
                <div className="font-medium text-gray-900">{j.name}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${j.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {j.is_available ? 'Available' : 'Unavailable'}
                  </span>
                  <button
                    onClick={() => openEdit(j)}
                    className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Edit
                  </button>
                </div>
              </div>
              <Stars rating={j.rating} />
              <div className="text-xs text-gray-500 mt-2">{j.email}</div>
              {j.address && <div className="text-xs text-gray-400 mt-0.5">{j.address}</div>}
              {j.bio && <p className="text-xs text-gray-600 mt-3 line-clamp-3">{j.bio}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Judge Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit judge' : 'Add judge'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <Field label="Name *">
                <input type="text" required value={form.name} onChange={e => setField('name', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Email *">
                <input type="email" required value={form.email} onChange={e => setField('email', e.target.value)} className={inputCls} />
              </Field>

              <Field label="Address">
                <input type="text" value={form.address} onChange={e => setField('address', e.target.value)} className={inputCls} placeholder="Studio or home address" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Rating (0–5)">
                  <input type="number" min={0} max={5} step={0.5} value={form.rating} onChange={e => setField('rating', e.target.value)} className={inputCls} placeholder="e.g. 4.5" />
                </Field>
                <Field label="Availability">
                  <select value={form.is_available ? 'yes' : 'no'} onChange={e => setField('is_available', e.target.value === 'yes')} className={inputCls}>
                    <option value="yes">Available</option>
                    <option value="no">Unavailable</option>
                  </select>
                </Field>
              </div>

              <Field label="Bio">
                <textarea
                  value={form.bio}
                  onChange={e => setField('bio', e.target.value)}
                  rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Short biography…"
                />
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
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add judge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
