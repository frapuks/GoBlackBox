import { useState } from 'react'
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { WeeklyDigest } from '@blackbox/shared'
import { useDigest } from '../api/hooks'
import { BadgeMark } from './badges'
import { Card, formatDayRange } from './ui'
import { palette } from '../theme'

/**
 * Le résumé de la semaine écoulée, en tête du classement.
 *
 * Replié, il tient en une ligne : les dates, le total, et ce qui le situe —
 * l'écart avec la semaine d'avant, ou le record. Déplié, il raconte le reste.
 * Le classement reste ainsi à portée de pouce, sans défiler un écran de plus.
 *
 * Rien à afficher avant la première publication : la carte n'existe pas,
 * plutôt que d'annoncer un résumé vide.
 */
export const DigestCard = () => {
  const { data: digest } = useDigest()
  const [open, setOpen] = useState(false)

  if (!digest) return null

  const delta = digest.total - digest.previousTotal

  return (
    <Card sx={{ p: 0, mb: 3, overflow: 'hidden' }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2, cursor: 'pointer' }}
        aria-expanded={open}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">
            La semaine du {formatDayRange(digest.weekStart, digest.weekEnd)}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography
              sx={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.6rem', lineHeight: 1 }}
            >
              {digest.total} €
            </Typography>
            {/* Le record prime sur l'écart : il dit déjà que c'est beaucoup, et
                bien plus fort qu'un « +40 € ». */}
            {digest.isRecord ? (
              <Chip
                size="small"
                label="Record de la saison"
                sx={{ height: 22, bgcolor: 'rgba(249,115,22,0.15)', color: palette.accent }}
              />
            ) : (
              <Typography variant="caption" color="text.secondary">
                {deltaLabel(delta)}
              </Typography>
            )}
          </Stack>
        </Box>

        <ExpandMoreIcon
          sx={{
            color: palette.textMuted,
            transition: 'transform .2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </Box>

      <Collapse in={open} unmountOnExit>
        <Stack
          spacing={2}
          sx={{ px: 2, pb: 2, pt: 1.5, borderTop: '1px solid rgba(148,163,184,0.15)' }}
        >
          <Details digest={digest} />
        </Stack>
      </Collapse>
    </Card>
  )
}

/** « +40 € par rapport à la semaine dernière ». En euros : un pourcentage ment sur de petites sommes. */
const deltaLabel = (delta: number) =>
  delta === 0
    ? 'Autant que la semaine dernière'
    : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} € par rapport à la semaine dernière`

/** Au-delà, la liste des pénalités deviendrait le résumé à elle seule. */
const MAX_LISTED = 5

/**
 * Le détail, rubrique par rubrique. Une rubrique vide disparaît : une semaine
 * sans pénalité n'a pas à afficher « Aucune pénalité ».
 */
const Details = ({ digest }: { digest: WeeklyDigest }) => (
  <>
    {digest.fineCount === 0 && (
      <Typography variant="body2" color="text.secondary">
        Aucune amende cette semaine.
      </Typography>
    )}

    {digest.topPlayer && (
      <Section title="Le plus sanctionné">
        <strong>{digest.topPlayer.name}</strong> · {digest.topPlayer.count} amende
        {digest.topPlayer.count > 1 ? 's' : ''} · {digest.topPlayer.amount} €
      </Section>
    )}

    {digest.badgeChanges.length > 0 && (
      <Section title="Badges">
        <Stack spacing={1}>
          {digest.badgeChanges.map((b) => (
            <Stack key={b.label} direction="row" spacing={1} alignItems="center">
              <BadgeMark art={b.image} size={28} />
              <Typography variant="body2">
                <strong>{b.to}</strong>{' '}
                {b.from ? (
                  <>
                    prend « {b.label} » à <strong>{b.from}</strong>
                  </>
                ) : (
                  <>décroche « {b.label} »</>
                )}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Section>
    )}

    {digest.rankMoves.length > 0 && (
      <Section title="Classement">
        <Stack spacing={0.5}>
          {digest.rankMoves.map((m) => (
            <Typography key={m.name} variant="body2">
              <strong>{m.name}</strong>{' '}
              {m.from === null ? (
                <>entre {rank(m.to)}</>
              ) : (
                <Box
                  component="span"
                  // Monter au classement, c'est avoir reçu plus d'amendes : le
                  // rouge dit « ça coûte », pas « c'est bien ».
                  sx={{ color: m.to < m.from ? palette.danger : palette.textMuted }}
                >
                  {rank(m.from)} → {rank(m.to)}
                </Box>
              )}
            </Typography>
          ))}
        </Stack>
      </Section>
    )}

    {digest.penalties.length > 0 && (
      <Section title="Pénalités de retard">
        {digest.penalties
          .slice(0, MAX_LISTED)
          .map((p) => `${p.name} (${p.count})`)
          .join(', ')}
        {digest.penalties.length > MAX_LISTED &&
          ` et ${digest.penalties.length - MAX_LISTED} autre${digest.penalties.length - MAX_LISTED > 1 ? 's' : ''}`}
      </Section>
    )}

    {/* Le seul élément positif du résumé : il valorise ceux qu'on ne cite jamais. */}
    {(digest.cleanPlayers.length > 0 || digest.longestStreak) && (
      <Section title="Sans amende">
        <Stack spacing={0.5}>
          {digest.cleanPlayers.length > 0 && (
            <Typography variant="body2">
              {digest.cleanPlayers.join(', ')}
            </Typography>
          )}
          {digest.longestStreak && (
            <Typography variant="body2" sx={{ color: palette.accentSoft }}>
              Plus longue série : <strong>{digest.longestStreak.names.join(', ')}</strong>,{' '}
              {digest.longestStreak.weeks} semaines sans amende
            </Typography>
          )}
        </Stack>
      </Section>
    )}

    <Section title="Encaissé">{digest.collected} €</Section>

    {digest.dues && (
      <Section title="Cotisation">
        {digest.dues.label} · {digest.dues.count} × {digest.dues.amount} €
      </Section>
    )}
  </>
)

/** « 1re », « 2e ». */
const rank = (n: number) => (n === 1 ? '1re' : `${n}e`)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Box>
    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
      {title}
    </Typography>
    <Typography component="div" variant="body2">
      {children}
    </Typography>
  </Box>
)
