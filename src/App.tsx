import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
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
import JudgeReference from '@/pages/JudgeReference'
import WebsiteReport from '@/pages/WebsiteReport'
import Portal from '@/pages/Portal'
import Join from '@/pages/Join'
import Profile from '@/pages/Profile'
import Settings from '@/pages/Settings'
import SetPassword from '@/pages/SetPassword'

/** Legacy /history/:token links → /portal/:token (scenario A). */
function HistoryRedirect() {
  const { token } = useParams<{ token: string }>()
  return <Navigate to={`/portal/${token}`} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />
          <Route path="/set-password" element={<SetPassword />} />

          {/* Token-based portals (no auth) */}
          <Route path="/submit/:token" element={<Submit />} />
          <Route path="/judge/:token" element={<Judge />} />
          <Route path="/judge/:token/reference" element={<JudgeReference />} />

          {/* Member self-service portal */}
          <Route path="/portal/:token" element={<Portal />} />
          <Route path="/portal" element={<Portal />} />
          {/* Legacy history links redirect into the portal, preserving the token */}
          <Route path="/history/:token" element={<HistoryRedirect />} />

          {/* Admin reference view (JWT auth via API, no layout so it's printable) */}
          <Route path="/competitions/:id/reference" element={<JudgeReference />} />
          <Route path="/competitions/:id/website-report" element={<WebsiteReport />} />

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
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  )
}
