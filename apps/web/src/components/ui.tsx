import { Avatar, Box, Chip, Stack, Typography } from '@mui/material'
import type { SxProps } from '@mui/material'
import { fineColor, palette, type FineState } from '../theme'

/** Titre de section : Bebas Neue, capitales, comme sur les maquettes. */
export const SectionTitle = ({ children, sx }: { children: string; sx?: SxProps }) => (
  <Typography variant="h3" sx={{ color: palette.text, mb: 1.5, ...sx }}>
    {children.toUpperCase()}
  </Typography>
)

/**
 * Un montant. Sa couleur reflète UNIQUEMENT l'état de l'amende, jamais sa
 * valeur : jaune à payer, rouge en retard, gris payé.
 * Un montant de 0 € s'affiche « 0 € » — la sanction réelle (tournée, pack de
 * bières) est décrite dans la description de la règle.
 */
export const Amount = ({
  amount,
  state,
  size = 'md',
}: {
  amount: number
  state: FineState
  size?: 'md' | 'lg'
}) => (
  <Typography
    sx={{
      fontFamily: '"Bebas Neue", sans-serif',
      fontSize: size === 'lg' ? '1.6rem' : '1.25rem',
      lineHeight: 1,
      color: fineColor(state),
      textDecoration: state === 'paid' ? 'line-through' : 'none',
      whiteSpace: 'nowrap',
    }}
  >
    {amount} €
  </Typography>
)

/** État d'affichage d'une amende, dérivé une seule fois pour toute l'app. */
export const fineState = (paid: boolean, isLate: boolean): FineState =>
  paid ? 'paid' : isLate ? 'late' : 'due'

/** Pas de photos de profil en V1 : initiales sur fond neutre. */
export const Initials = ({ name, size = 40 }: { name: string; size?: number }) => {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <Avatar sx={{ width: size, height: size, bgcolor: '#2A2F36', color: palette.textMuted }}>
      <Typography sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}>
        {initials}
      </Typography>
    </Avatar>
  )
}

/**
 * Pastille d'état, identique partout : fil d'activité, fiche membre,
 * classement. Un seul composant, donc impossible que deux écrans divergent.
 */
export const StatusChip = ({ state }: { state: FineState }) => (
  <Chip
    size="small"
    variant="outlined"
    label={state === 'paid' ? 'Payée' : state === 'late' ? 'En retard' : 'À payer'}
    sx={{ color: fineColor(state), borderColor: fineColor(state), height: 22 }}
  />
)

/** Raccourci pour les endroits qui n'ont pas d'amende, seulement un constat. */
export const LateBadge = () => <StatusChip state="late" />

/**
 * Montant d'une règle : un chiffre unique, ou la fourchette de ses paliers.
 * Les deux ne coexistent jamais — une règle à paliers n'a pas de montant propre.
 */
export const RuleAmount = ({
  amount,
  tiers,
  size = 'lg',
}: {
  amount: number
  tiers: { amount: number }[]
  size?: 'md' | 'lg'
}) => {
  if (tiers.length === 0) return <Amount amount={amount} state="due" size={size} />

  const values = tiers.map((t) => t.amount)
  const min = Math.min(...values)
  const max = Math.max(...values)

  return (
    <Typography
      sx={{
        fontFamily: '"Bebas Neue", sans-serif',
        fontSize: size === 'lg' ? '1.6rem' : '1.25rem',
        lineHeight: 1,
        color: fineColor('due'),
        whiteSpace: 'nowrap',
      }}
    >
      {min === max ? `${min} €` : `${min} – ${max} €`}
    </Typography>
  )
}

export const EmptyState = ({ children }: { children: string }) => (
  <Box sx={{ py: 6, textAlign: 'center' }}>
    <Typography variant="overline" color="text.secondary">
      {children}
    </Typography>
  </Box>
)

export const Card = ({
  children,
  sx,
  onClick,
}: {
  children: React.ReactNode
  sx?: SxProps
  onClick?: () => void
}) => (
  <Box onClick={onClick} sx={{ bgcolor: 'background.paper', borderRadius: 2, p: 2, ...sx }}>
    {children}
  </Box>
)

export const Row = ({ children, sx }: { children: React.ReactNode; sx?: SxProps }) => (
  <Stack direction="row" alignItems="center" spacing={1.5} sx={sx}>
    {children}
  </Stack>
)

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

/** « il y a 2 h », « hier », « lun 14 » — comme dans les maquettes. */
export const formatAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return "à l'instant"
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'hier'
  if (days < 7) return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
  return formatDate(iso)
}
