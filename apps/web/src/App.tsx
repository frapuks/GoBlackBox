import { Box, CircularProgress } from '@mui/material'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useMe } from './api/hooks'
import { AppLayout } from './components/AppLayout'
import { ClaimPage, LoginPage, SignupPage } from './pages/AuthPages'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { FeedPage } from './pages/FeedPage'
import { AddFinePage } from './pages/AddFinePage'
import { RulesPage } from './pages/RulesPage'
import { MePage, MemberPage } from './pages/MemberPages'
import { SettingsPage } from './pages/SettingsPages'

const FullPageSpinner = () => (
  <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
    <CircularProgress />
  </Box>
)

/**
 * Trois états possibles :
 *  - déconnecté               → /login
 *  - connecté sans membre     → /signup/claim (l'inscription n'est pas finie)
 *  - connecté avec membre     → l'app
 */
const RequireSession = ({ needsMember = true }: { needsMember?: boolean }) => {
  const { data: me, isPending } = useMe()
  const location = useLocation()

  if (isPending) return <FullPageSpinner />
  if (!me) return <Navigate to="/login" replace />
  if (needsMember && !me.member && location.pathname !== '/signup/claim') {
    return <Navigate to="/signup/claim" replace />
  }

  return <Outlet />
}

/** Empêche de revenir sur login/signup quand la session est déjà ouverte. */
const RedirectIfAuthenticated = ({ children }: { children: React.ReactNode }) => {
  const { data: me, isPending } = useMe()

  if (isPending) return <FullPageSpinner />
  if (me) return <Navigate to={me.member ? '/' : '/signup/claim'} replace />

  return <>{children}</>
}

export const App = () => (
  <BrowserRouter>
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/signup"
        element={
          <RedirectIfAuthenticated>
            <SignupPage />
          </RedirectIfAuthenticated>
        }
      />

      {/* Le claim exige une session mais pas encore de membre : c'est
          précisément l'écran qui le crée. */}
      <Route element={<RequireSession needsMember={false} />}>
        <Route path="/signup/claim" element={<ClaimPage />} />
      </Route>

      <Route element={<RequireSession />}>
        <Route path="/fines/new" element={<AddFinePage />} />

        <Route element={<AppLayout />}>
          <Route path="/" element={<LeaderboardPage />} />
          <Route path="/fines" element={<FeedPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/me/settings" element={<SettingsPage />} />
          <Route path="/members/:id" element={<MemberPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
)
