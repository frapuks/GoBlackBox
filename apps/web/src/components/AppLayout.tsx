import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import BarChartIcon from '@mui/icons-material/BarChart'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import GavelIcon from '@mui/icons-material/Gavel'
import PersonIcon from '@mui/icons-material/Person'
import { Box, BottomNavigation, BottomNavigationAction, Container, Fab } from '@mui/material'
import { useMe } from '../api/hooks'
import { pageSpacing, palette } from '../theme'

const TABS = [
  { to: '/', label: 'Classement', icon: <BarChartIcon /> },
  { to: '/fines', label: 'Fil', icon: <RssFeedIcon /> },
  { to: '/rules', label: 'Règles', icon: <GavelIcon /> },
  { to: '/me', label: 'Moi', icon: <PersonIcon /> },
]

export const AppLayout = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const me = useMe()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'
  // Le FAB n'apparaît que sur les deux onglets d'où l'on saisit réellement.
  const showFab = isStaff && (pathname === '/' || pathname === '/fines')

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
        showLabels
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
            label={tab.label}
            icon={tab.icon}
          />
        ))}
      </BottomNavigation>
    </Box>
  )
}
