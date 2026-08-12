import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SettingsIcon from '@mui/icons-material/Settings'
import type { MemberDetail } from '@blackbox/shared'
import { useMember } from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  Initials,
  LateBadge,
  SectionTitle,
  StatusChip,
  fineState,
  formatDate,
} from '../components/ui'
import { palette } from '../theme'

/**
 * `/me` et `/members/:id` affichent exactement la même chose : un seul
 * composant, deux routes. Toujours en lecture seule — un joueur ne coche
 * jamais une amende, sinon la caisse ne veut plus rien dire.
 */
const MemberView = ({ member, title }: { member: MemberDetail; title: string }) => {
  // Masquées par défaut : ce qui compte au quotidien, c'est ce qui reste à payer.
  const [showPaid, setShowPaid] = useState(false)

  const paidCount = member.fines.filter((f) => f.paidAt !== null).length
  const fines = showPaid ? member.fines : member.fines.filter((f) => f.paidAt === null)

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

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1.5 }}
      >
        <SectionTitle sx={{ mb: 0 }}>Amendes</SectionTitle>
        {/* Au-dessus de la liste : l'interrupteur garde la même place quel que
            soit le nombre d'amendes affichées, au lieu de sauter à chaque clic. */}
        {paidCount > 0 && (
          <FormControlLabel
            sx={{ mr: 0 }}
            labelPlacement="start"
            control={
              <Switch
                size="small"
                checked={showPaid}
                onChange={(e) => setShowPaid(e.target.checked)}
                inputProps={{ 'aria-label': 'Afficher les ' + paidCount + ' amendes payées' }}
              />
            }
            label={
              <Typography variant="overline" color="text.secondary">
                Payées ({paidCount})
              </Typography>
            }
          />
        )}
      </Stack>

      {fines.length === 0 && (
        <EmptyState>
          {member.fines.length === 0 ? 'Aucune amende. Bravo.' : 'Tout est payé. Bravo.'}
        </EmptyState>
      )}

      <Stack spacing={1}>
        {fines.map((f) => {
          const paid = f.paidAt !== null
          return (
            <Card
              key={f.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                opacity: paid ? 0.5 : 1,
                borderLeft: f.isLate ? '3px solid ' + palette.danger : '3px solid transparent',
              }}
            >
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: palette.accentSoft }}>
                  {formatDate(f.createdAt)}
                </Typography>
                <Typography
                  sx={{ fontWeight: 600, textDecoration: paid ? 'line-through' : 'none' }}
                  noWrap
                >
                  {f.label}
                </Typography>
              </Stack>

              <Amount amount={f.amount} state={fineState(paid, f.isLate)} />

              <StatusChip state={fineState(paid, f.isLate)} />
            </Card>
          )
        })}
      </Stack>

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
        <Initials name={data.displayName} size={32} />
        <Typography sx={{ fontWeight: 600, flex: 1 }} noWrap>
          {data.displayName}
        </Typography>
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
        <Initials name={data.displayName} size={32} />
        <Typography sx={{ fontWeight: 600 }}>{data.displayName}</Typography>
      </Stack>

      <MemberView member={data} title="Solde" />
    </>
  )
}
