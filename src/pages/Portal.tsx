import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PortalLookupForm from '@/components/portal/PortalLookupForm'
import PortalProfileForm, { type PortalMember } from '@/components/portal/PortalProfileForm'
import MemberSubmissionForm from '@/components/portal/MemberSubmissionForm'
import MemberHistoryView, { type MemberHistoryData } from '@/components/portal/MemberHistoryView'

interface OpenCompetition {
  competitionId: string
  name: string
  submitToken: string
}

type Screen = 'loading' | 'portal' | 'lookup'
type Tab = 'competitions' | 'profile'

export default function Portal() {
  const { token } = useParams<{ token: string }>()
  const [screen, setScreen] = useState<Screen>('loading')
  const [member, setMember] = useState<PortalMember | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('competitions')

  useEffect(() => {
    let cancelled = false

    async function establish() {
      if (token) {
        // Scenario A: token in URL → exchange for a session cookie.
        const res = await fetch('/api/portal/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (res.ok) {
          const { member } = await res.json()
          setMember(member)
          setScreen('portal')
          // Strip the token from the address bar without a remount.
          window.history.replaceState(null, '', '/portal')
          return
        }
        // Invalid link → fall through to the lookup form with a notice.
        setNotice('That link is no longer valid. Enter your details below and we’ll send a fresh one.')
        setScreen('lookup')
        return
      }

      // Scenario B/C: no token → try the session cookie.
      const res = await fetch('/api/portal/me')
      if (cancelled) return
      if (res.ok) {
        const { member } = await res.json()
        setMember(member)
        setScreen('portal')
      } else {
        setScreen('lookup')
      }
    }

    establish()
    return () => { cancelled = true }
  }, [token])

  if (screen === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }

  if (screen === 'lookup' || !member) {
    return <PortalLookupForm notice={notice} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 pt-6">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">
            Wairarapa Camera Club
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {member.firstName} {member.lastName}
          </h1>
          {member.membershipNumber && (
            <p className="text-sm text-gray-400 mt-0.5">Member #{member.membershipNumber}</p>
          )}

          {/* Tabs */}
          <nav className="flex gap-6 mt-5 -mb-px">
            {([['competitions', 'Competitions'], ['profile', 'My Profile']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === key
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {tab === 'competitions' && <CompetitionsTab />}
        {tab === 'profile' && <PortalProfileForm member={member} onUpdated={setMember} />}
      </div>
    </div>
  )
}

function CompetitionsTab() {
  const [open, setOpen] = useState<OpenCompetition[] | null>(null)
  const [history, setHistory] = useState<MemberHistoryData | null>(null)

  useEffect(() => {
    fetch('/api/portal/open-competitions')
      .then(r => r.ok ? r.json() : { competitions: [] })
      .then(d => setOpen(d.competitions))
      .catch(() => setOpen([]))
    fetch('/api/portal/history')
      .then(r => r.ok ? r.json() : null)
      .then(setHistory)
      .catch(() => setHistory(null))
  }, [])

  return (
    <div className="space-y-8">
      {/* Open competitions */}
      <section>
        {open === null ? (
          <div className="text-gray-400 text-sm">Loading open competitions…</div>
        ) : open.length === 0 ? (
          <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-5 py-4">
            No competitions are open for submissions right now.
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Open for submissions</h2>
            {open.map(c => (
              <div key={c.competitionId} className="bg-gray-50/50 border border-gray-200 rounded-xl p-5">
                <MemberSubmissionForm token={c.submitToken} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Your competition history</h2>
        {history === null ? (
          <div className="text-gray-400 text-sm">Loading history…</div>
        ) : (
          <MemberHistoryView data={history} />
        )}
      </section>
    </div>
  )
}
