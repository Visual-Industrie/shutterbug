import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  website: string | null
  facebook: string | null
  instagram: string | null
  comp_count: number
}

interface JudgeForm {
  name: string
  email: string
  bio: string
  address: string
  rating: string
  is_available: boolean
  website: string
  facebook: string
  instagram: string
}

interface JudgedComp {
  id: string
  name: string
  opens_at: string | null
  status: string
}

const EMPTY_FORM: JudgeForm = {
  name: '', email: '', bio: '', address: '', rating: '', is_available: true,
  website: '', facebook: '', instagram: '',
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

function StatusBadge({ status }: { status: string }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-500',
    open: 'bg-green-100 text-green-700',
    closed: 'bg-orange-100 text-orange-700',
    judging: 'bg-blue-100 text-blue-700',
    complete: 'bg-purple-100 text-purple-700',
  }
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${c[status] ?? 'bg-gray-100 text-gray-500'}`}>{status}</span>
}

// Normalise a URL — add https:// if no protocol
function toUrl(raw: string) {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

function IconWebsite() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconFacebook() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function IconInstagram() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SocialIcons({ judge, size = 'sm' }: { judge: Pick<Judge, 'website' | 'facebook' | 'instagram'>; size?: 'sm' | 'md' }) {
  const cls = size === 'md'
    ? 'text-gray-400 hover:text-gray-700 transition-colors'
    : 'text-gray-300 hover:text-gray-500 transition-colors'
  return (
    <div className="flex items-center gap-2">
      {judge.website && (
        <a href={toUrl(judge.website)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={cls} title="Website">
          <IconWebsite />
        </a>
      )}
      {judge.facebook && (
        <a href={toUrl(judge.facebook)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={cls} title="Facebook">
          <IconFacebook />
        </a>
      )}
      {judge.instagram && (
        <a href={toUrl(judge.instagram)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className={cls} title="Instagram">
          <IconInstagram />
        </a>
      )}
    </div>
  )
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Judges() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  // Edit sidebar
  const [editing, setEditing] = useState<Judge | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [form, setForm] = useState<JudgeForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  // View modal
  const [viewing, setViewing] = useState<Judge | null>(null)
  const [viewComps, setViewComps] = useState<JudgedComp[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  const { data: judges = [], isLoading } = useQuery<Judge[]>({
    queryKey: ['judges', search, onlyAvailable],
    queryFn: async () => {
      let q = supabase
        .from('judges')
        .select('id,name,email,bio,address,rating,is_available,website,facebook,instagram,competition_judges(id)')
        .order('name')

      if (onlyAvailable) q = q.eq('is_available', true)
      if (search) q = q.ilike('name', `%${search}%`)

      const { data } = await q
      return (data ?? []).map((j: Record<string, unknown>) => ({
        ...(j as Omit<Judge, 'comp_count'>),
        comp_count: Array.isArray(j.competition_judges) ? j.competition_judges.length : 0,
      }))
    },
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, form }: { id: string | null; form: JudgeForm }) =>
      id
        ? apiFetch(`/api/judges/${id}`, { method: 'PATCH', body: JSON.stringify(form) })
        : apiFetch('/api/judges', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setShowEdit(false)
      queryClient.invalidateQueries({ queryKey: ['judges'] })
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    },
  })

  function openEdit(j: Judge) {
    setEditing(j)
    setForm({
      name: j.name,
      email: j.email,
      bio: j.bio ?? '',
      address: j.address ?? '',
      rating: j.rating ?? '',
      is_available: j.is_available,
      website: j.website ?? '',
      facebook: j.facebook ?? '',
      instagram: j.instagram ?? '',
    })
    setFormError(null)
    setShowEdit(true)
  }

  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowEdit(true)
  }

  async function openView(j: Judge) {
    setViewing(j)
    setViewComps([])
    setViewLoading(true)
    const { data } = await supabase
      .from('competition_judges')
      .select('competitions(id, name, opens_at, status)')
      .eq('judge_id', j.id)
    const comps = (data ?? [])
      .map((r: Record<string, unknown>) => r.competitions as JudgedComp | null)
      .filter((c): c is JudgedComp => c != null)
      .sort((a, b) => (b.opens_at ?? '').localeCompare(a.opens_at ?? ''))
    setViewComps(comps)
    setViewLoading(false)
  }

  function setField<K extends keyof JudgeForm>(k: K, v: JudgeForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    saveMutation.mutate({ id: editing?.id ?? null, form })
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

      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {judges.length === 0 && (
            <div className="col-span-3 text-center text-gray-400 py-8">No judges found</div>
          )}
          {judges.map(j => (
            <div
              key={j.id}
              onClick={() => openView(j)}
              className="bg-white rounded-xl border border-gray-200 p-4 group cursor-pointer hover:border-amber-200 hover:shadow-sm transition-all"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-2">
                <div className="font-medium text-gray-900">{j.name}</div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${j.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {j.is_available ? 'Available' : 'Unavailable'}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(j) }}
                    className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Edit
                  </button>
                </div>
              </div>

              <Stars rating={j.rating} />
              <div className="text-xs text-gray-500 mt-2">{j.email}</div>
              {j.address && <div className="text-xs text-gray-400 mt-0.5">{j.address}</div>}
              {j.bio && <p className="text-xs text-gray-600 mt-3 line-clamp-2">{j.bio}</p>}

              {/* Footer row */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <SocialIcons judge={j} />
                {j.comp_count > 0 && (
                  <span className="text-xs text-gray-400">
                    {j.comp_count} competition{j.comp_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── View Modal ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewing(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{viewing.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <Stars rating={viewing.rating} />
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${viewing.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {viewing.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  onClick={() => { setViewing(null); openEdit(viewing) }}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
                <button onClick={() => setViewing(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Contact */}
              <div className="space-y-1">
                <div className="text-sm text-gray-700">{viewing.email}</div>
                {viewing.address && <div className="text-sm text-gray-500">{viewing.address}</div>}
              </div>

              {/* Social links */}
              {(viewing.website || viewing.facebook || viewing.instagram) && (
                <div className="flex items-center gap-4">
                  {viewing.website && (
                    <a href={toUrl(viewing.website)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline">
                      <IconWebsite /> Website
                    </a>
                  )}
                  {viewing.facebook && (
                    <a href={toUrl(viewing.facebook)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline">
                      <IconFacebook /> Facebook
                    </a>
                  )}
                  {viewing.instagram && (
                    <a href={toUrl(viewing.instagram)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline">
                      <IconInstagram /> Instagram
                    </a>
                  )}
                </div>
              )}

              {/* Bio */}
              {viewing.bio && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Bio</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewing.bio}</p>
                </div>
              )}

              {/* Competitions */}
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  Competitions judged ({viewing.comp_count})
                </p>
                {viewLoading ? (
                  <div className="text-sm text-gray-400">Loading…</div>
                ) : viewComps.length === 0 ? (
                  <div className="text-sm text-gray-400">None on record.</div>
                ) : (
                  <div className="space-y-1">
                    {viewComps.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-4 py-1.5 border-b border-gray-50 last:border-0">
                        <Link
                          to={`/competitions/${c.id}`}
                          onClick={() => setViewing(null)}
                          className="text-sm text-amber-700 hover:underline truncate"
                        >
                          {c.name}
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">{fmt(c.opens_at)}</span>
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Sidebar ── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-start justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white h-full w-full max-w-md shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit judge' : 'Add judge'}</h2>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
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

              <div className="pt-1 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Online presence</p>
                <div className="space-y-3">
                  <Field label="Website">
                    <input type="text" value={form.website} onChange={e => setField('website', e.target.value)} className={inputCls} placeholder="https://example.com" />
                  </Field>
                  <Field label="Facebook">
                    <input type="text" value={form.facebook} onChange={e => setField('facebook', e.target.value)} className={inputCls} placeholder="https://facebook.com/…" />
                  </Field>
                  <Field label="Instagram">
                    <input type="text" value={form.instagram} onChange={e => setField('instagram', e.target.value)} className={inputCls} placeholder="https://instagram.com/…" />
                  </Field>
                </div>
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
              <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saveMutation.isPending} onClick={handleSubmit} className="flex-1 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add judge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
