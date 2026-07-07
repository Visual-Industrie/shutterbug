import { useState } from 'react'

export interface PortalMember {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: string | null
  membershipNumber: string | null
}

/**
 * My Profile tab. Members may edit address, phone and email only — first/last
 * name and membership number are shown read-only for context. Saving hits
 * PATCH /api/portal/profile, which whitelists the editable fields server-side.
 */
export default function PortalProfileForm({
  member,
  onUpdated,
}: {
  member: PortalMember
  onUpdated: (m: PortalMember) => void
}) {
  const [email, setEmail] = useState(member.email)
  const [phone, setPhone] = useState(member.phone ?? '')
  const [address, setAddress] = useState(member.address ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/portal/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, address }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ text: json.error ?? 'Could not save your details', ok: false })
        return
      }
      onUpdated(json.member)
      setMsg({ text: 'Your details have been saved.', ok: true })
    } catch {
      setMsg({ text: 'An unexpected error occurred', ok: false })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {/* Read-only context */}
      <div className="flex gap-6 pb-4 border-b border-gray-100">
        <div>
          <div className="text-xs text-gray-400">Name</div>
          <div className="text-sm font-medium text-gray-900">{member.firstName} {member.lastName}</div>
        </div>
        {member.membershipNumber && (
          <div>
            <div className="text-xs text-gray-400">Member #</div>
            <div className="text-sm font-medium text-gray-900">{member.membershipNumber}</div>
          </div>
        )}
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Address</label>
        <textarea
          value={address}
          onChange={e => setAddress(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

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
