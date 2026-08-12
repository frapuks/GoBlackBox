import { Link, Outlet, useLocation } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import BarChartIcon from '@mui/icons-material/BarChart'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import GavelIcon from '@mui/icons-material/Gavel'
import PersonIcon from '@mui/icons-material/Person'
import { Box, Container, Fab } from '@mui/material'
import { useMe } from '../api/hooks'
import { pageSpacing, palette } from '../theme'

/** Hauteur de la barre du bas, zone sûre comprise. */
export const NAV_HEIGHT = 'calc(env(safe-area-inset-bottom, 0px) + 57px)'

/**
 * Hauteur à dégager pour poser un élément fixe au-dessus de la barre : le
 * bouton central déborde de 28 px, il faut le laisser passer.
 */
export const NAV_CLEARANCE = 'calc(env(safe-area-inset-bottom, 0px) + 89px)'

// Sans libellé, l'icône est seule à porter le sens : le `label` sert
// d'aria-label pour les lecteurs d'écran.
const TABS = [
  { to: '/', label: 'Moi', icon: <PersonIcon /> },
  { to: '/fines', label: 'Fil', icon: <RssFeedIcon /> },
  { to: '/rules', label: 'Règles', icon: <GavelIcon /> },
  { to: '/leaderboard', label: 'Classement', icon: <BarChartIcon /> },
]

const NavItem = ({
  to,
  label,
  icon,
  active,
}: {
  to: string
  label: string
  icon: React.ReactNode
  active: boolean
}) => (
  <Box
    component={Link}
    to={to}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    sx={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
      color: active ? palette.accent : palette.textMuted,
      textDecoration: 'none',
    }}
  >
    {icon}
  </Box>
)

/**
 * Barre du bas construite à la main plutôt qu'avec `BottomNavigation` : celui-ci
 * indexe ses enfants par position pour déterminer l'onglet actif, et supporte
 * mal qu'on intercale un bouton d'action au milieu.
 */
export const AppLayout = () => {
  const { pathname } = useLocation()
  const me = useMe()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'
  // Sur l'écran d'ajout, le bouton change d'action mais reste en place : le
  // retirer redistribuerait les quatre onglets et ferait sauter toutes les icônes.
  const adding = pathname === '/fines/new'

  return (
    <Box sx={{ pb: 10, minHeight: '100dvh' }}>
      <Container maxWidth="sm" disableGutters sx={pageSpacing}>
        <Outlet />
      </Container>

      <Box
        component="nav"
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          bgcolor: palette.surface,
          borderTop: '1px solid rgba(148,163,184,0.15)',
          pb: 'env(safe-area-inset-bottom)',
          zIndex: (t) => t.zIndex.appBar,
        }}
      >
        {TABS.slice(0, 2).map((tab) => (
          <NavItem key={tab.to} {...tab} active={pathname === tab.to} />
        ))}

        {/* Bouton d'action central, réservé aux gestionnaires. Absent pour un
            joueur, les quatre onglets se répartissent toute la largeur. */}
        {isStaff && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Fab
              color="primary"
              component={Link}
              to={adding ? '/fines' : '/fines/new'}
              aria-label={adding ? 'Quitter la saisie' : 'Ajouter une amende'}
              sx={{
                // Débordement au-dessus de la barre + anneau de la couleur de
                // la barre : le bouton semble découpé dedans plutôt que posé.
                mt: -3.5,
                border: `4px solid ${palette.surface}`,
                boxShadow: '0 6px 18px rgba(249,115,22,0.45)',
              }}
            >
              {adding ? <CloseIcon /> : <AddIcon />}
            </Fab>
          </Box>
        )}

        {TABS.slice(2).map((tab) => (
          <NavItem key={tab.to} {...tab} active={pathname === tab.to} />
        ))}
      </Box>
    </Box>
  )
}
