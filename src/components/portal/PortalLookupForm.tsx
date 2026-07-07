import { useState } from 'react'

/**
 * Scenario C: no token in URL and no valid session cookie. Members recover access
 * by entering their email + membership number; on a match the backend emails a
 * fresh magic link. The response is always identical regardless of whether a
 * member matched, so this form can never be used to probe membership.
 */
export default function PortalLookupForm({ notice }: { notice?: string | null }) {
  const [email, setEmail] = useState('')
  const [membershipNumber, setMembershipNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/portal/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, membershipNumber }),
      })
    } catch {
      // Even on network error we show the neutral confirmation — the important
      // thing is never to reveal whether the details matched.
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
            Wairarapa Camera Club
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Member portal</h1>
          <p className="text-sm text-gray-500 mt-2">
            View your competition history, submit entries to open competitions, and
            keep your contact details up to date.
          </p>
        </div>

        {notice && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
            {notice}
          </div>
        )}

        {sent ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <div className="text-3xl mb-3">✉️</div>
            <p className="text-sm text-gray-700">
              If those details match a member, we've sent a magic link to that email
              address. Check your inbox to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-500">
              Enter your details and we'll email you a link to your portal.
            </p>
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Membership number</label>
              <input
                type="text"
                value={membershipNumber}
                onChange={e => setMembershipNumber(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Email me a link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
