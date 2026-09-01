import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SettingsIcon from '@mui/icons-material/Settings'
import type { Fine, MemberDetail } from '@blackbox/shared'
import { useMember, useMembers } from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  Initials,
  LateBadge,
  MemberName,
  SectionTitle,
  StatusChip,
  fineState,
  formatDate,
} from '../components/ui'
import { memberBadges } from '../components/badges'
import { palette } from '../theme'

/**
 * Une ligne d'amende, identique dans « Amendes » et dans « Historique ».
 *
 * Une payée reste barrée et estompée : dans l'historique le contexte le dit
 * déjà, mais la même carte apparaît aussi dans la liste du dessus le temps d'un
 * rafraîchissement, et deux rendus différents pour la même amende se
 * remarqueraient.
 */
const FineRow = ({ fine }: { fine: Fine }) => {
  const paid = fine.paidAt !== null

  return (
    <Card
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        opacity: paid ? 0.5 : 1,
        borderLeft: fine.isLate ? '3px solid ' + palette.danger : '3px solid transparent',
      }}
    >
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: palette.accentSoft }}>
          {formatDate(fine.createdAt)}
        </Typography>
        <Typography
          sx={{ fontWeight: 600, textDecoration: paid ? 'line-through' : 'none' }}
          noWrap
        >
          {fine.label}
        </Typography>
      </Stack>

      <Amount amount={fine.amount} state={fineState(paid, fine.isLate)} />

      <StatusChip state={fineState(paid, fine.isLate)} />
    </Card>
  )
}

/**
 * `/me` et `/members/:id` affichent exactement la même chose : un seul
 * composant, deux routes. Toujours en lecture seule — un joueur ne coche
 * jamais une amende, sinon la caisse ne veut plus rien dire.
 */
const MemberView = ({ member, title }: { member: MemberDetail; title: string }) => {
  // Deux sections plutôt qu'un interrupteur : ce qui reste à payer est ce qu'on
  // vient voir, le reste est consultable sans avoir à le demander. La liste
  // arrive déjà triée impayées d'abord, puis par date décroissante — filtrer
  // conserve cet ordre des deux côtés.
  const unpaid = member.fines.filter((f) => f.paidAt === null)
  const paid = member.fines.filter((f) => f.paidAt !== null)

  return (
    <>
      <Card sx={{ textAlign: 'center', py: 3, mb: 2 }}>
        <Typography variant="overline" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h1" sx={{ fontSize: '3rem', color: palette.text }}>
          {member.totalOwed} €
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
          <Chip
            size="small"
            variant="outlined"
            label={member.totalPaid + ' € payés'}
            sx={{ color: palette.textMuted }}
          />
          {member.hasLate && <LateBadge />}
        </Stack>
      </Card>

      <SectionTitle>Amendes</SectionTitle>

      {unpaid.length === 0 && (
        <EmptyState>
          {member.fines.length === 0 ? 'Aucune amende. Bravo.' : 'Tout est payé. Bravo.'}
        </EmptyState>
      )}

      <Stack spacing={1}>
        {unpaid.map((f) => (
          <FineRow key={f.id} fine={f} />
        ))}
      </Stack>

      {/* Pas de section vide : sans rien de payé, il n'y a pas d'historique. */}
      {paid.length > 0 && (
        <>
          <SectionTitle sx={{ mt: 4 }}>Historique</SectionTitle>
          <Stack spacing={1}>
            {paid.map((f) => (
              <FineRow key={f.id} fine={f} />
            ))}
          </Stack>
        </>
      )}
    </>
  )
}

export const MePage = () => {
  const { data, isPending } = useMember('me')
  // Une requête de plus, mais déjà en cache : elle sert au fil, au sélecteur
  // d'amende et aux réglages.
  const badges = memberBadges(useMembers().data ?? [])

  if (isPending) return <CircularProgress />
  if (!data) return null

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <Initials name={data.displayName} size={32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MemberName name={data.displayName} badges={badges.get(data.id)} />
        </Box>
        <IconButton component={RouterLink} to="/me/settings" aria-label="Réglages">
          <SettingsIcon />
        </IconButton>
      </Stack>

      <MemberView member={data} title="Mon solde" />
    </>
  )
}

export const MemberPage = () => {
  const { id } = useParams()
  const { data, isPending } = useMember(Number(id))
  const badges = memberBadges(useMembers().data ?? [])

  if (isPending) return <CircularProgress />
  if (!data) return null

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <IconButton component={RouterLink} to="/leaderboard" aria-label="Retour">
          <ArrowBackIcon />
        </IconButton>
        <Initials name={data.displayName} size={32} />
        <MemberName name={data.displayName} badges={badges.get(data.id)} />
      </Stack>

      <MemberView member={data} title="Solde" />
    </>
  )
}
