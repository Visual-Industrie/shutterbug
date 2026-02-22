import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
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
          <div className="text-xs text-gray-500 truncate">{user?.name}</div>
          <div className="text-xs text-gray-400 capitalize truncate">{user?.role?.replace(/_/g, ' ')}</div>
          <button
            onClick={handleLogout}
            className="mt-2 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
