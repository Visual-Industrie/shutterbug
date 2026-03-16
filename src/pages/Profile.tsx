import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiFetch } from '@/lib/api'

export default function Profile() {
  const { user } = useAuth()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (next !== confirm) { setError('New passwords do not match'); return }
    if (next.length < 8) { setError('New password must be at least 8 characters'); return }

    setSaving(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

  return (
    <div className="p-8 max-w-md">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Profile</h1>
      <p className="text-sm text-gray-500 mb-6">{user?.email}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Change password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
            <input type="password" required value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
            <input type="password" required value={next} onChange={e => setNext(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
            <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Password updated successfully.</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2 px-4 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
