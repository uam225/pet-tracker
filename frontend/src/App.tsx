import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { petsApi } from '@/api'
import { assignPetColors } from '@/utils/petColors'
import { LoadingScreen } from '@/components/ui'

import { LoginPage }      from '@/pages/auth/LoginPage'
import { SetupWizard }    from '@/pages/setup/SetupWizard'
import { DashboardPage }  from '@/pages/dashboard/DashboardPage'
import { FeedPage }       from '@/pages/feed/FeedPage'
import { HealthPage }     from '@/pages/health/HealthPage'
import { LibraryPage }    from '@/pages/library/LibraryPage'
import { SettingsPage }   from '@/pages/settings/SettingsPage'
import { ReactNode }      from 'react'

// ─── Auth guard ───────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!user)     return <Navigate to="/login" replace />
  return <>{children}</>
}

// ─── Setup guard ──────────────────────────────────────────────────────────────
// Redirects to /setup if no pets have been created yet.

function RequireSetup({ children }: { children: ReactNode }) {
  const { data: pets, isLoading } = useQuery({
    queryKey: ['pets'],
    queryFn: () => petsApi.list(),
  })

  if (isLoading) return <LoadingScreen />

  if (pets !== undefined && pets.length > 0) {
    // Assign stable colours to pets now that we have the list.
    assignPetColors(pets.map(p => p.id))
  }

  if (pets?.length === 0) return <Navigate to="/setup" replace />
  return <>{children}</>
}

// ─── Root redirect ────────────────────────────────────────────────────────────

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* First-run wizard (requires login, allows no pets) */}
      <Route path="/setup" element={
        <RequireAuth><SetupWizard /></RequireAuth>
      } />

      {/* Protected app routes */}
      <Route path="/dashboard" element={
        <RequireAuth><RequireSetup><DashboardPage /></RequireSetup></RequireAuth>
      } />
      <Route path="/feed" element={
        <RequireAuth><RequireSetup><FeedPage /></RequireSetup></RequireAuth>
      } />
      <Route path="/health" element={
        <RequireAuth><RequireSetup><HealthPage /></RequireSetup></RequireAuth>
      } />
      <Route path="/library" element={
        <RequireAuth><RequireSetup><LibraryPage /></RequireSetup></RequireAuth>
      } />
      <Route path="/settings" element={
        <RequireAuth><SettingsPage /></RequireAuth>
      } />

      {/* Fallback */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  )
}
