import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { petsApi, authApi } from '@/api'
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

// ─── Login route ────────────────────────────────────────────────────────────
// Renders the login form, but redirects away from it in two cases:
//   - Already authenticated: go straight to the dashboard.
//   - No accounts exist yet (first-run, count === 0): nobody can log in,
//     so send the visitor to the setup wizard's account creation step.
//
// /api/auth/status is publicly accessible (no auth required), so this check
// is safe to run before a session exists.

function LoginRoute() {
  const { user, isLoading: authLoading } = useAuth()
  const { data: regStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn:  authApi.status,
    enabled:  !authLoading && !user,
  })

  if (authLoading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  if (statusLoading) return <LoadingScreen />
  if (regStatus?.current_count === 0) return <Navigate to="/setup" replace />

  return <LoginPage />
}

// ─── Root redirect ────────────────────────────────────────────────────────────
// Used for "/" and any unmatched path. Mirrors LoginRoute's first-run check
// so a fresh deployment lands on the setup wizard rather than a login form
// that no account can satisfy.

function RootRedirect() {
  const { user, isLoading: authLoading } = useAuth()
  const { data: regStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn:  authApi.status,
    enabled:  !authLoading && !user,
  })

  if (authLoading) return <LoadingScreen />
  if (user) return <Navigate to="/dashboard" replace />
  if (statusLoading) return <LoadingScreen />
  if (regStatus?.current_count === 0) return <Navigate to="/setup" replace />

  return <Navigate to="/login" replace />
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Public: redirects to /setup on first run (no accounts) or /dashboard if logged in */}
      <Route path="/login" element={<LoginRoute />} />

      {/* First-run wizard. Reachable without authentication so the very first
          account can be created. SetupWizard itself determines the correct
          starting step based on auth state and registration status. */}
      <Route path="/setup" element={<SetupWizard />} />

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
