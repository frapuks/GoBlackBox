import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import BarChartIcon from '@mui/icons-material/BarChart'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import GavelIcon from '@mui/icons-material/Gavel'
import PersonIcon from '@mui/icons-material/Person'
import { Box, Container, Fab } from '@mui/material'
import { useFineEntry } from '../api/hooks'
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
 * SONDE TEMPORAIRE — à retirer une fois le diagnostic fait.
 *
 * Affiche ce qu'iOS répond réellement, au premier rendu puis une seconde plus
 * tard : c'est la seule façon de trancher sans devtools sur iPhone.
 *
 *   inner / client : hauteur du viewport de mise en page
 *   vv             : visualViewport (hauteur + décalage)
 *   screen         : hauteur de l'écran physique, en points
 *   safeBottom     : valeur résolue de env(safe-area-inset-bottom)
 *   frame          : le cadre `position: fixed; inset: 0`
 *   nav            : la barre du bas
 *
 * Si `nav.bottom` est inférieur à `inner`, le cadre ne descend pas jusqu'en bas.
 * Si `nav.bottom` vaut `inner` mais que l'écart est visible, c'est l'écran qui
 * est plus haut que le viewport — donc `viewport-fit=cover` sans effet.
 */
const LayoutProbe = ({
  frameRef,
  navRef,
}: {
  frameRef: React.RefObject<HTMLElement | null>
  navRef: React.RefObject<HTMLElement | null>
}) => {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    const read = (tag: string) => {
      // env() ne se lit pas au JavaScript : on mesure une sonde qui l'applique.
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:absolute;visibility:hidden;height:env(safe-area-inset-bottom,0px)'
      document.body.appendChild(probe)
      const safeBottom = probe.offsetHeight
      probe.remove()

      const f = frameRef.current?.getBoundingClientRect()
      const n = navRef.current?.getBoundingClientRect()
      const vv = window.visualViewport
      const r = (x: number | undefined) => (x === undefined ? '?' : Math.round(x))

      return [
        `${tag} inner=${window.innerHeight} client=${document.documentElement.clientHeight}`,
        `${tag} vv=${r(vv?.height)}+${r(vv?.offsetTop)} screen=${window.screen.height}`,
        `${tag} safeBottom=${safeBottom}`,
        `${tag} frame h=${r(f?.height)} bottom=${r(f?.bottom)}`,
        `${tag} nav h=${r(n?.height)} bottom=${r(n?.bottom)}`,
      ]
    }

    setLines(read('t0'))
    const id = setTimeout(() => setLines((prev) => [...prev, ...read('t1')]), 1200)
    return () => clearTimeout(id)
  }, [frameRef, navRef])

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        zIndex: 9999,
        p: 1,
        bgcolor: 'rgba(0,0,0,0.85)',
        color: '#7CFC98',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.45,
        pointerEvents: 'none',
      }}
    >
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </Box>
  )
}

/**
 * Barre du bas construite à la main plutôt qu'avec `BottomNavigation` : celui-ci
 * indexe ses enfants par position pour déterminer l'onglet actif, et supporte
 * mal qu'on intercale un bouton d'action au milieu.
 */
export const AppLayout = () => {
  const { pathname } = useLocation()
  const entry = useFineEntry()
  const frameRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)


  // Sur l'écran d'ajout, le bouton change d'action mais reste en place : le
  // retirer redistribuerait les quatre onglets et ferait sauter toutes les icônes.
  const adding = pathname === '/fines/new'

  return (
    // Cadre plein écran SANS unité de hauteur de viewport.
    //
    // `inset: 0` est résolu par rapport au viewport au moment du rendu, alors
    // que `100dvh` est une longueur calculée — et c'est celle-là qu'iOS évalue
    // trop tôt au lancement d'une app installée sur l'écran d'accueil, d'où une
    // barre du bas légèrement décalée jusqu'au premier défilement.
    //
    // La barre reste la dernière ligne d'une colonne flex, donc elle n'est pas
    // positionnée elle-même : elle suit le bas de son conteneur.
    <Box
      ref={frameRef}
      sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}
    >
      <LayoutProbe frameRef={frameRef} navRef={navRef} />
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
        ref={navRef}
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
        {entry.allowed && (
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
