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

/** Débordement du bouton central au-dessus de la barre, en pixels. */
export const FAB_OVERFLOW = 28

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
    // Colonne haute d'un écran : la barre est la dernière ligne du flux, pas un
    // élément positionné. Au lancement d'une PWA iOS, WebKit calcule la hauteur
    // du layout viewport avant d'y intégrer la zone du home indicator : un
    // `position: fixed; bottom: 0` s'accroche alors à un bas d'écran provisoire
    // et paraît surélevé jusqu'au premier défilement.
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box component="main" sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {/* La marge basse dégage le débordement du bouton central, sinon les
            dernières lignes passent dessous en fin de défilement. */}
        <Container
          maxWidth="sm"
          disableGutters
          sx={{ ...pageSpacing, pb: `${FAB_OVERFLOW + 24}px` }}
        >
          <Outlet />
        </Container>
      </Box>

      <Box
        component="nav"
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          bgcolor: palette.surface,
          borderTop: '1px solid rgba(148,163,184,0.15)',
          pb: 'env(safe-area-inset-bottom, 0px)',
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
                mt: `-${FAB_OVERFLOW}px`,
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
