import { useEffect, useState } from 'react'
import MemberProfileFields from '@/components/MemberProfileFields'
import { toProfileForm, type MemberProfileFormValues } from '@/shared/memberProfile'

export interface PortalMember {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  membershipNumber: string | null
}

interface ReadOnlyFields {
  membership_number: string | null
  membership_type: string
  status: string
}

interface ProfileResponse {
  profile: Record<string, unknown>
  readOnly: ReadOnlyFields
}

/**
 * My details tab. Members edit their personal details with the same fields the
 * admin pages use; membership number, type and status are shown read-only.
 * PATCH /api/portal/profile validates with the shared schema and strips
 * anything that isn't a personal field.
 */
export default function PortalProfileForm({
  onUpdated,
}: {
  onUpdated: (m: PortalMember) => void
}) {
  const [form, setForm] = useState<MemberProfileFormValues | null>(null)
  const [readOnly, setReadOnly] = useState<ReadOnlyFields | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  function apply(data: ProfileResponse) {
    setForm(toProfileForm(data.profile))
    setReadOnly(data.readOnly)
  }

  useEffect(() => {
    fetch('/api/portal/profile')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then(apply)
      .catch(() => setLoadError(true))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setMsg(null)
    setEmailError(null)
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setEmailError(json.error ?? 'That email address is already in use')
        return
      }
      if (!res.ok) {
        setMsg({ text: json.error ?? 'Could not save your details', ok: false })
        return
      }
      apply(json)
      onUpdated(json.member)
      setMsg({ text: 'Your details have been saved.', ok: true })
    } catch {
      setMsg({ text: 'An unexpected error occurred', ok: false })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return <div className="text-sm text-red-600">Could not load your details. Please refresh the page.</div>
  }
  if (!form || !readOnly) {
    return <div className="text-sm text-gray-400">Loading…</div>
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {/* Read-only membership fields — only the club can change these */}
      <div className="flex flex-wrap gap-6 pb-4 border-b border-gray-100">
        <div>
          <div className="text-xs text-gray-400">Member #</div>
          <div className="text-sm font-medium text-gray-900">{readOnly.membership_number ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Membership type</div>
          <div className="text-sm font-medium text-gray-900 capitalize">{readOnly.membership_type}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Status</div>
          <div className="text-sm font-medium text-gray-900 capitalize">{readOnly.status}</div>
        </div>
      </div>

      <MemberProfileFields
        value={form}
        onChange={patch => {
          setForm(prev => (prev ? { ...prev, ...patch } : prev))
          if ('email' in patch) setEmailError(null)
        }}
        emailError={emailError}
      />

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="py-2.5 px-5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
