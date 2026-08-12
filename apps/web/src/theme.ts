import { createTheme } from '@mui/material/styles'

// Polices self-hébergées : aucun appel à Google Fonts, l'app charge
// instantanément sur le Pi et fonctionne sans réseau sortant.
import '@fontsource/bebas-neue/400.css'
import '@fontsource/archivo-narrow/400.css'
import '@fontsource/archivo-narrow/600.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'

export const palette = {
  accent: '#F97316',
  accentSoft: '#FACC15',
  danger: '#EF4444',
  bg: '#0B0E11',
  surface: '#1C1F24',
  dialog: '#0F172A',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
} as const

/**
 * État d'une amende. La couleur ne dépend JAMAIS du montant : elle ne dit que
 * où en est le paiement.
 *
 * Le tarif d'une règle n'a pas d'état de paiement, mais on l'affiche quand même
 * en « due » : c'est ce que ça coûtera, et ça garde une seule couleur pour
 * « de l'argent à sortir » dans toute l'app.
 */
export type FineState = 'due' | 'late' | 'paid'

export const fineColor = (state: FineState): string =>
  state === 'paid' ? palette.textMuted : state === 'late' ? palette.danger : palette.accentSoft

/**
 * Marges hautes et latérales identiques sur tous les écrans, encoche comprise.
 * `env(safe-area-inset-*)` vaut 0 partout ailleurs, donc c'est sans effet sur
 * un écran classique.
 */
export const pageSpacing = {
  pt: 'calc(env(safe-area-inset-top, 0px) + 16px)',
  pl: 'calc(env(safe-area-inset-left, 0px) + 16px)',
  pr: 'calc(env(safe-area-inset-right, 0px) + 16px)',
} as const

const display = '"Bebas Neue", sans-serif'
const label = '"Archivo Narrow", sans-serif'
const body = '"Inter", sans-serif'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: palette.accent, contrastText: '#0B0E11' },
    secondary: { main: palette.accentSoft, contrastText: '#0B0E11' },
    error: { main: palette.danger },
    background: { default: palette.bg, paper: palette.surface },
    text: { primary: palette.text, secondary: palette.textMuted },
    divider: 'rgba(148, 163, 184, 0.15)',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: body,
    // Bebas Neue : titres de section et gros chiffres, toujours en capitales.
    h1: { fontFamily: display, letterSpacing: '0.02em', fontSize: '3rem' },
    h2: { fontFamily: display, letterSpacing: '0.02em', fontSize: '2.25rem' },
    h3: { fontFamily: display, letterSpacing: '0.02em', fontSize: '1.75rem' },
    // Archivo Narrow : labels, badges, navigation.
    overline: {
      fontFamily: label,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    button: { fontFamily: label, fontWeight: 600, letterSpacing: '0.06em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: palette.bg },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'uppercase' },
      },
    },
    MuiChip: {
      styleOverrides: {
        label: { fontFamily: label, fontWeight: 600, letterSpacing: '0.06em' },
      },
    },
  },
})
