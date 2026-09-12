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
import { useMember } from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  ProfileAvatar,
  LateBadge,
  MemberName,
  SectionTitle,
  StatusChip,
  fineState,
  formatDate,
} from '../components/ui'
import { BadgeMark, badgeDetail } from '../components/badges'
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

        {/* Rien à afficher tant qu'aucun badge n'est porté : mieux vaut pas de
            section qu'une section vide.

            En grille et non en liste : l'image est le sujet, le texte la
            légende. Des colonnes d'au moins 104 px donnent trois badges par
            rangée sur un téléphone, quatre dès qu'il y a la place. */}
        {member.badges.length > 0 && (
          <Box
            sx={{
              mt: 2.5,
              pt: 2,
              borderTop: '1px solid rgba(148,163,184,0.15)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
              gap: 2,
            }}
          >
            {member.badges.map((badge, i) => (
              <Stack key={i} spacing={0.75} alignItems="center" sx={{ textAlign: 'center' }}>
                <BadgeMark art={badge.icon} size={56} />
                <Typography variant="caption" sx={{ lineHeight: 1.25 }}>
                  {badge.label}
                </Typography>
                <Typography color="text.secondary" sx={{ fontSize: '0.68rem', lineHeight: 1.2 }}>
                  {badgeDetail(badge)}
                </Typography>
              </Stack>
            ))}
          </Box>
        )}
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

  if (isPending) return <CircularProgress />
  if (!data) return null

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <ProfileAvatar name={data.displayName} badges={data.badges} size={32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <MemberName name={data.displayName} />
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

  if (isPending) return <CircularProgress />
  if (!data) return null

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <IconButton component={RouterLink} to="/leaderboard" aria-label="Retour">
          <ArrowBackIcon />
        </IconButton>
        <ProfileAvatar name={data.displayName} badges={data.badges} size={32} />
        <MemberName name={data.displayName} />
      </Stack>

      <MemberView member={data} title="Solde" />
    </>
  )
}
