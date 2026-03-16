import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/admin/ProtectedRoute'
import Layout from '@/components/admin/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Members from '@/pages/Members'
import Applicants from '@/pages/Applicants'
import Competitions from '@/pages/Competitions'
import Judges from '@/pages/Judges'
import Leaderboard from '@/pages/Leaderboard'
import EmailLog from '@/pages/EmailLog'
import CompetitionDetail from '@/pages/CompetitionDetail'
import Submit from '@/pages/Submit'
import Judge from '@/pages/Judge'
import History from '@/pages/History'
import Join from '@/pages/Join'
import Profile from '@/pages/Profile'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />

          {/* Token-based portals (no auth) */}
          <Route path="/submit/:token" element={<Submit />} />
          <Route path="/judge/:token" element={<Judge />} />
          <Route path="/history/:token" element={<History />} />

          {/* Admin — protected + Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/members" element={<Members />} />
            <Route path="/applicants" element={<Applicants />} />
            <Route path="/competitions" element={<Competitions />} />
            <Route path="/competitions/:id" element={<CompetitionDetail />} />
            <Route path="/judges" element={<Judges />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/email" element={<EmailLog />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
