import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiFetch } from '@/lib/api'
import { Navigate } from 'react-router-dom'

interface SettingRow {
  key: string
  section: string
  label: string
  value: string | null
  default_value: string | null
  description: string | null
}

const TABS = [
  { id: 'comp', label: 'Competition Defaults' },
]

// The COMP settings we care about, in display order
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

export default function Settings() {
  const { user } = useAuth()

  if (user?.role !== 'super_admin') return <Navigate to="/" replace />

  const [tab, setTab] = useState('comp')
  const [rows, setRows] = useState<SettingRow[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch<SettingRow[]>('/api/settings?section=COMP')
      .then(data => {
        setRows(data)
        const initial: Record<string, string> = {}
        data.forEach(r => { initial[r.key] = r.value ?? r.default_value ?? '' })
        setDraft(initial)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function set(key: string, val: string) {
    setSaved(false)
    setDraft(d => ({ ...d, [key]: val }))
  }

  function rowFor(key: string) {
    return rows.find(r => r.key === key)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(draft) })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">

          {tab === 'comp' && (
            <>
              {/* Points */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Points</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Default points pre-filled when creating a new competition. Each competition can override these.
                </p>
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
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={draft[key] ?? ''}
                          onChange={e => set(key, e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Entry limits */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Entry limits</h2>
                <p className="text-xs text-gray-400 mb-4">
                  Default maximum entries per member per competition.
                </p>
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
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={draft[key] ?? ''}
                          onChange={e => set(key, e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Settings saved.</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
