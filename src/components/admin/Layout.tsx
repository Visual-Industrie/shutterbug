import { useState } from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

const nav = [
  { to: '/',              label: 'Dashboard',    icon: '⊞' },
  { to: '/members',       label: 'Members',      icon: '👥' },
  { to: '/applicants',    label: 'Applicants',   icon: '📋' },
  { to: '/competitions',  label: 'Events',       icon: '📷' },
  { to: '/judges',        label: 'Judges',       icon: '⭐' },
  { to: '/leaderboard',   label: 'Leaderboard',  icon: '🏆' },
  { to: '/email',         label: 'Email',        icon: '✉' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-56 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200 md:static md:translate-x-0 md:z-auto ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="text-sm font-bold text-gray-900 leading-tight">Wairarapa</div>
          <div className="text-sm font-bold text-amber-600 leading-tight">Camera Club</div>
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={closeMenu}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200">
          <Link to="/profile" onClick={closeMenu} className="block group">
            <div className="text-xs font-medium text-gray-700 truncate group-hover:text-amber-700 transition-colors">{user?.name}</div>
            <div className="text-xs text-gray-400 capitalize truncate">{user?.role?.replace(/_/g, ' ')}</div>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div>
            <span className="text-sm font-bold text-gray-900">Wairarapa </span>
            <span className="text-sm font-bold text-amber-600">Camera Club</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
