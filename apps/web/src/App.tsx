import { Box, CircularProgress } from '@mui/material'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useFineEntry, useMe } from './api/hooks'
import { AppLayout } from './components/AppLayout'
import { ClaimPage, ForcedPasswordPage, LoginPage, SignupPage } from './pages/AuthPages'
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
 * Quatre états possibles :
 *  - déconnecté                    → /login
 *  - mot de passe réinitialisé     → /password (avant tout le reste)
 *  - connecté sans membre          → /signup/claim (l'inscription n'est pas finie)
 *  - connecté avec membre          → l'app
 */
const RequireSession = ({ needsMember = true }: { needsMember?: boolean }) => {
  const { data: me, isPending } = useMe()
  const location = useLocation()

  if (isPending) return <FullPageSpinner />
  if (!me) return <Navigate to="/login" replace />

  // Avant la réclamation du nom : un mot de passe temporaire ne doit ouvrir
  // aucune autre page, pas même celle qui termine l'inscription.
  if (me.user.mustChangePassword && location.pathname !== '/password') {
    return <Navigate to="/password" replace />
  }

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

/**
 * L'API refuse déjà la création d'amende à un joueur (403). Cette garde évite
 * simplement de lui laisser remplir trois étapes avant de se heurter au refus.
 */
const RequireStaff = () => {
  const entry = useFineEntry()
  // Tant que les réglages chargent, on ne renvoie personne : sinon un joueur
  // autorisé serait éjecté le temps d une requête.
  if (entry.loading) return <Outlet />
  if (!entry.allowed) return <Navigate to="/" replace />
  return <Outlet />
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
        {/* Hors de AppLayout : pas de barre de navigation vers des pages
            qu'on refuserait d'ouvrir de toute façon. */}
        <Route path="/password" element={<ForcedPasswordPage />} />
      </Route>

      <Route element={<RequireSession />}>
        <Route element={<AppLayout />}>
          {/* L'accueil, c'est sa propre page : ce qu'on ouvre l'app pour voir. */}
          <Route path="/" element={<MePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/fines" element={<FeedPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/me/settings" element={<SettingsPage />} />
          <Route path="/members/:id" element={<MemberPage />} />
          <Route element={<RequireStaff />}>
            <Route path="/fines/new" element={<AddFinePage />} />
          </Route>
          {/* Ancienne adresse : les raccourcis déjà installés continuent de marcher. */}
          <Route path="/me" element={<Navigate to="/" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
)
