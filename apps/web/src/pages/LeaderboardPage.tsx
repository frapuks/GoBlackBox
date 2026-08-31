import { useNavigate } from 'react-router-dom'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { useDashboard, usePotHistory, useSettings } from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  Initials,
  LateBadge,
  SectionTitle,
  formatDay,
  formatDayRange,
} from '../components/ui'
import { PotChart } from '../components/PotChart'
import { palette } from '../theme'

/** Podium coloré, neutre au-delà de la 3e place. */
const rankColor = (rank: number) =>
  rank === 1
    ? palette.danger
    : rank === 2
      ? palette.accent
      : rank === 3
        ? palette.accentSoft
        : 'transparent'

export const LeaderboardPage = () => {
  const navigate = useNavigate()
  const { data, isPending } = useDashboard()
  const settings = useSettings()
  const history = usePotHistory()

  if (isPending) return <CircularProgress />
  if (!data) return null

  // Un participant hors amendes n'a rien à faire dans un classement d'amendes —
  // sauf s'il en a déjà reçu avant d'en être sorti : son historique reste dû, et
  // le masquer donnerait une cagnotte dont une part n'est attribuée à personne.
  const ranked = data.members.filter((m) => m.receivesFines || m.hasFines)

  return (
    <>
      <Stack alignItems="center" sx={{ pb: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Cagnotte totale
        </Typography>
        <Typography variant="h1" sx={{ fontSize: '3.5rem', color: palette.text }}>
          {data.totalOwed + data.totalPaid} €
        </Typography>
        <Typography variant="overline" color="text.secondary">
          {data.totalPaid} € encaissés · {data.totalOwed} € en attente
        </Typography>

        {/* Purement informatif : aucune de ces dates ne ferme la caisse ni ne
            bloque quoi que ce soit. Le bloc disparaît tant que rien n'est
            renseigné, plutôt que d'afficher des tirets. */}
        {(settings.data?.endDate || settings.data?.usageStartDate) && (
          <Stack alignItems="center" spacing={0.25} sx={{ mt: 1.5 }}>
            {settings.data.endDate && (
              <Typography variant="caption" color="text.secondary">
                Fin de la caisse · {formatDay(settings.data.endDate)}
              </Typography>
            )}
            {settings.data.usageStartDate && (
              <Typography variant="caption" sx={{ color: palette.accentSoft }}>
                Utilisation ·{' '}
                {formatDayRange(settings.data.usageStartDate, settings.data.usageEndDate)}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>

      <PotChart
        history={history.data?.points ?? []}
        projection={history.data?.projection ?? null}
      />

      <SectionTitle>Classement</SectionTitle>

      {ranked.length === 0 && <EmptyState>Aucun membre pour le moment</EmptyState>}

      <Stack spacing={1}>
        {ranked.map((m, i) => {
          const rank = i + 1
          const settled = m.totalOwed === 0

          return (
            <Card
              key={m.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: 'pointer',
                opacity: settled ? 0.5 : 1,
                borderLeft: '3px solid ' + rankColor(rank),
              }}
              onClick={() => navigate('/members/' + m.id)}
            >
              <Typography
                sx={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.4rem', width: 20 }}
                color={rank <= 3 ? 'text.primary' : 'text.secondary'}
              >
                {rank}
              </Typography>

              <Initials name={m.displayName} />

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {m.displayName}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                  <Typography variant="caption" color="text.secondary">
                    {m.totalPaid} € payés
                  </Typography>
                  {m.hasLate && <LateBadge />}
                </Stack>
              </Box>

              <Amount
                amount={m.totalOwed}
                state={settled ? 'paid' : m.hasLate ? 'late' : 'due'}
                size="lg"
              />
            </Card>
          )
        })}
      </Stack>
    </>
  )
}
