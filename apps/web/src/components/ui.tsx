import { Avatar, Box, Chip, Stack, Typography } from '@mui/material'
import type { SxProps } from '@mui/material'
import { fromDayKey, type MemberBadge } from '@blackbox/shared'
import { profileBadge } from './badges'
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

/**
 * Total des amendes d'un joueur sur la saison, payées comprises — le chiffre
 * du classement.
 *
 * Volontairement NEUTRE : dans cette app la couleur ne dit que l'état d'un
 * paiement, et un cumul de saison n'en a aucun. Le reste à payer, lui, garde sa
 * couleur là où il est affiché.
 */
export const Score = ({ amount }: { amount: number }) => (
  <Typography
    sx={{
      fontFamily: '"Bebas Neue", sans-serif',
      fontSize: '1.6rem',
      lineHeight: 1,
      color: palette.text,
      whiteSpace: 'nowrap',
    }}
  >
    {amount} €
  </Typography>
)


/** État d'affichage d'une amende, dérivé une seule fois pour toute l'app. */
export const fineState = (paid: boolean, isLate: boolean, isPenalized = false): FineState =>
  // La majoration passe avant le retard : une amende majorée est TOUJOURS en
  // retard, et c'est ce qui la distingue qu'on veut montrer.
  paid ? 'paid' : isPenalized ? 'penalized' : isLate ? 'late' : 'due'

/**
 * Nom d'un participant.
 *
 * Il n'accompagne plus aucune icône — les distinctions vivent dans l'avatar,
 * juste à gauche. Le composant reste parce qu'il fixe la graisse et la
 * troncature du nom partout de la même façon.
 */
export const MemberName = ({
  name,
  noWrap = true,
  sx,
}: {
  name: string
  /**
   * Faux là où le nom sert à IDENTIFIER quelqu'un plutôt qu'à l'accompagner —
   * la grille de sélection d'amende. Un nom tronqué y ferait désigner le
   * mauvais joueur.
   */
  noWrap?: boolean
  sx?: SxProps
}) => (
  <Typography noWrap={noWrap} sx={{ fontWeight: 600, minWidth: 0, ...sx }}>
    {name}
  </Typography>
)


/**
 * L'avatar d'un participant : son badge s'il en porte un, ses initiales sinon.
 *
 * Pas de photos de profil — le badge tient ce rôle. Il est carré à la source et
 * `Avatar` le découpe en cercle, donc les coins de l'image ne s'affichent
 * jamais : c'est pourquoi la consigne de génération demande un disque qui
 * remplit tout le cadre.
 *
 * Les badges restent optionnels : l'écran d'inscription liste des noms avant
 * toute connexion, et n'a donc aucun classement à sa disposition.
 */
export const ProfileAvatar = ({
  name,
  badges = [],
  size = 40,
}: {
  name: string
  badges?: MemberBadge[]
  size?: number
}) => {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()

  const badge = profileBadge(badges)

  if (badge)
    return (
      <Box sx={{ position: 'relative', flexShrink: 0, width: size, height: size }}>
        <Avatar
          src={badge.src}
          alt={badge.label}
          // Le titre est la seule façon de savoir ce que récompense l'image
          // depuis le classement. Le détail complet reste sur la fiche du joueur.
          title={badge.label}
          sx={{ width: size, height: size }}
        />

        {/* Le nombre de badges détenus, à partir de deux : à un seul il ne
            dirait rien de plus que l'image elle-même.
            Tout est proportionnel à l'avatar — la pastille doit rester la même
            chose qu'on l'affiche à 32 ou à 56 px —, avec un plancher pour que
            le chiffre reste lisible sur les plus petits. */}
        {badges.length > 1 && (
          <Box
            title={badges.length + ' badges'}
            sx={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: Math.max(16, size * 0.38),
              height: Math.max(16, size * 0.38),
              px: 0.4,
              borderRadius: 999,
              bgcolor: palette.accent,
              // Le liseré sombre détache la pastille de l'image dorée, qui est
              // claire par endroits : sans lui, le chiffre s'y noierait.
              border: '2px solid ' + palette.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Archivo Narrow", sans-serif',
              fontWeight: 700,
              fontSize: Math.max(10, size * 0.24),
              lineHeight: 1,
              color: palette.bg,
            }}
          >
            {badges.length}
          </Box>
        )}
      </Box>
    )

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
    label={
      state === 'paid'
        ? 'Payée'
        : state === 'penalized'
          ? 'Majorée'
          : state === 'late'
            ? 'En retard'
            : 'À payer'
    }
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

/**
 * Date civile « AAAA-MM-JJ » — celle des réglages de la caisse.
 *
 * L'arithmétique des jours vit dans `@blackbox/shared` : le serveur en a besoin
 * pour la prévision, et deux implémentations finiraient par diverger d'un jour.
 * Ne reste ici que la mise en forme, qui est propre au front.
 */
export const formatDay = (day: string) =>
  fromDayKey(day).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** « 12 juin 2027 » sur un jour, « 12 – 13 juin 2027 » sur un week-end. */
export const formatDayRange = (start: string, end: string | null) => {
  if (!end) return formatDay(start)
  // Même mois : le répéter des deux côtés alourdit sans rien apprendre.
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return sameMonth
    ? `${Number(start.slice(8))} – ${formatDay(end)}`
    : `${formatDay(start)} – ${formatDay(end)}`
}
