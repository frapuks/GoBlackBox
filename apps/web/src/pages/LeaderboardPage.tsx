import { useNavigate } from 'react-router-dom'
import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { rankedMembers, type MemberSummary } from '@blackbox/shared'
import { useDashboard, useMe, usePotHistory, useSettings } from '../api/hooks'
import {
  Card,
  EmptyState,
  ProfileAvatar,
  MemberName,
  Score,
  SectionTitle,
  formatDay,
  formatDayRange,
} from '../components/ui'
import { PotChart } from '../components/PotChart'
import { DigestCard } from '../components/DigestCard'
import { fineColor, palette, SELF_HIGHLIGHT } from '../theme'

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
  const { data, isPending } = useDashboard()
  // Le joueur qui regarde se repère dans la liste sans avoir à la parcourir.
  const myMemberId = useMe().data?.member?.id
  const settings = useSettings()
  // Chaque bloc optionnel attend les réglages avant de s'afficher : mieux vaut
  // le voir apparaître qu'apercevoir un instant ce que l'admin a coupé.
  const features = settings.data
  const history = usePotHistory(features?.enablePotChart === true)

  if (isPending) return <CircularProgress />
  if (!data) return null

  // Filtre et tri viennent du même endroit que le calcul des distinctions :
  // impossible que le podium des icônes désigne un autre premier que la liste.
  const ranked = rankedMembers(data.members)

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
        {features?.enableKittyDates && (features.endDate || features.usageStartDate) && (
          <Stack alignItems="center" spacing={0.25} sx={{ mt: 1.5 }}>
            {features.endDate && (
              <Typography variant="caption" color="text.secondary">
                Fin de la caisse · {formatDay(features.endDate)}
              </Typography>
            )}
            {features.usageStartDate && (
              <Typography variant="caption" sx={{ color: palette.accentSoft }}>
                Utilisation ·{' '}
                {formatDayRange(features.usageStartDate, features.usageEndDate)}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>

      {/* Au-dessus du graphique : ce qui s'est passé cette semaine se lit avant
          la tendance de la saison. */}
      {features?.enableDigest && <DigestCard />}

      {features?.enablePotChart && (
        <PotChart
          history={history.data?.points ?? []}
          projection={history.data?.projection ?? null}
        />
      )}

      {ranked.length === 0 && (
        <>
          <SectionTitle>{features?.enableLeaderboard ? 'Classement' : 'Joueurs'}</SectionTitle>
          <EmptyState>Aucun membre pour le moment</EmptyState>
        </>
      )}

      {ranked.length > 0 && features && !features.enableLeaderboard && (
        <SimpleList members={ranked} myMemberId={myMemberId} />
      )}

      {ranked.length > 0 && features?.enableLeaderboard && (
        <>
          <SectionTitle>Classement</SectionTitle>
          <Ranking members={ranked} myMemberId={myMemberId} />
        </>
      )}
    </>
  )
}

/**
 * Les joueurs par ordre alphabétique, et leur total : ni rang, ni podium, ni
 * badge, ni état de paiement. Ce qui sépare une liste d'un classement, c'est
 * précisément tout ce qu'on retire ici.
 *
 * Mêmes participants que le classement — seul l'ordre change.
 */
const SimpleList = ({
  members,
  myMemberId,
}: {
  members: MemberSummary[]
  myMemberId?: number
}) => {
  const navigate = useNavigate()
  const sorted = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName))

  return (
    <>
      <SectionTitle>Joueurs</SectionTitle>
      <Stack spacing={1}>
        {sorted.map((m) => (
          <Card
            key={m.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
              ...(m.id === myMemberId && { bgcolor: SELF_HIGHLIGHT }),
            }}
            onClick={() => navigate('/members/' + m.id)}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <MemberName
                name={m.displayName}
                sx={m.id === myMemberId ? { color: palette.accent } : undefined}
              />
            </Box>
            <Score amount={m.totalOwed + m.totalPaid} />
          </Card>
        ))}
      </Stack>
    </>
  )
}

const Ranking = ({
  members: ranked,
  myMemberId,
}: {
  members: MemberSummary[]
  myMemberId?: number
}) => {
  const navigate = useNavigate()

  return (
    <Stack spacing={1}>
      {ranked.map((m, i) => {
        const rank = i + 1
        const settled = m.totalOwed === 0
        const total = m.totalOwed + m.totalPaid

        return (
          <Card
            key={m.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              cursor: 'pointer',
              // Toutes les cartes ont le même fond. L'opacité réduite des
              // joueurs à jour datait d'un classement par montant dû, où elle
              // signalait « rien à réclamer » ; au total de saison, elle ne
              // faisait plus qu'assombrir des lignes au hasard du podium.
              // Ce qui reste dû se lit sous le nom, en couleur.
              borderLeft: '3px solid ' + rankColor(rank),
              ...(m.id === myMemberId && { bgcolor: SELF_HIGHLIGHT }),
            }}
            onClick={() => navigate('/members/' + m.id)}
          >
            <Typography
              sx={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.4rem', width: 20 }}
              color={rank <= 3 ? 'text.primary' : 'text.secondary'}
            >
              {rank}
            </Typography>

            <ProfileAvatar name={m.displayName} badges={m.badges} size={56} />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <MemberName
                name={m.displayName}
                sx={m.id === myMemberId ? { color: palette.accent } : undefined}
              />
              {/* Le détail sous le nom : le gros chiffre étant désormais le
                  total, il faut bien dire quelque part ce qui reste dû. Rien
                  d'autre — ni le payé, ni le retard : le classement n'est pas
                  l'écran des comptes, la fiche du joueur l'est. */}
              {!settled && (
                <Typography variant="caption" sx={{ color: fineColor('due') }}>
                  {m.totalOwed} € à payer
                </Typography>
              )}
            </Box>

            {/* Le critère du classement doit être le chiffre qu'on lit, sinon
                la liste paraît mal triée. */}
            <Score amount={total} />
          </Card>
        )
      })}
    </Stack>
  )
}
