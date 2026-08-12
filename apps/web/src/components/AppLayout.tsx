import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import BarChartIcon from '@mui/icons-material/BarChart'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import GavelIcon from '@mui/icons-material/Gavel'
import PersonIcon from '@mui/icons-material/Person'
import { Box, BottomNavigation, BottomNavigationAction, Container, Fab } from '@mui/material'
import { useMe } from '../api/hooks'
import { pageSpacing, palette } from '../theme'

// Sans libellé, l'icône est seule à porter le sens : le `label` sert
// d'aria-label pour les lecteurs d'écran.
const TABS = [
  { to: '/', label: 'Moi', icon: <PersonIcon /> },
  { to: '/fines', label: 'Fil', icon: <RssFeedIcon /> },
  { to: '/rules', label: 'Règles', icon: <GavelIcon /> },
  { to: '/leaderboard', label: 'Classement', icon: <BarChartIcon /> },
]

export const AppLayout = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const me = useMe()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'
  // Uniquement le fil : c'est l'écran de travail du gestionnaire, et le seul
  // endroit d'où l'on coche les paiements. Les autres onglets se consultent.
  const showFab = isStaff && pathname === '/fines'

  const activeTab = TABS.findIndex((t) => t.to === pathname)

  return (
    <Box sx={{ pb: 9, minHeight: '100dvh' }}>
      <Container maxWidth="sm" disableGutters sx={pageSpacing}>
        <Outlet />
      </Container>

      {showFab && (
        <Fab
          color="primary"
          aria-label="Ajouter une amende"
          onClick={() => navigate('/fines/new')}
          // Au-dessus de la barre de navigation, et au-dessus de la zone
          // sûre des iPhone (barre d'accueil).
          sx={{ position: 'fixed', right: 16, bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
        >
          <AddIcon />
        </Fab>
      )}

      <BottomNavigation
        value={activeTab === -1 ? false : activeTab}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: palette.surface,
          borderTop: `1px solid rgba(148,163,184,0.15)`,
          pb: 'env(safe-area-inset-bottom)',
          height: 'auto',
          minHeight: 64,
        }}
      >
        {TABS.map((tab) => (
          <BottomNavigationAction
            key={tab.to}
            component={Link}
            to={tab.to}
            aria-label={tab.label}
            icon={tab.icon}
          />
        ))}
      </BottomNavigation>
    </Box>
  )
}
