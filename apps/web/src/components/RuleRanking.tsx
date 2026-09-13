import { Box, Stack, Typography } from '@mui/material'
import type { BadgeImage } from '@blackbox/shared'
import { useMe, useRuleRanking } from '../api/hooks'
import { BadgeMark } from './badges'
import { palette, SELF_HIGHLIGHT } from '../theme'

/**
 * La course au badge d'une règle : qui le porte, et où en sont les autres.
 *
 * L'ordre vient du serveur, qui applique exactement le départage du badge : le
 * premier est donc toujours le porteur, et il est le seul à montrer l'image à
 * la place de son rang.
 *
 * Monté dans une carte dépliée seulement : la requête ne part qu'à l'ouverture.
 */
export const RuleRanking = ({ ruleId, badge }: { ruleId: number; badge: BadgeImage }) => {
  const { data } = useRuleRanking(ruleId)
  const myMemberId = useMe().data?.member?.id
  if (!data) return null

  return (
    <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(148,163,184,0.15)' }}>
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Personne n&apos;a encore reçu cette amende.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {data.map((entry, i) => {
            const isMe = entry.memberId === myMemberId
            return (
              <Stack
                key={entry.memberId}
                direction="row"
                spacing={1.25}
                alignItems="center"
                // Le fond déborde de la marge, pour que le texte reste aligné sur
                // les autres lignes : la teinte encadre sans décaler.
                sx={{
                  mx: -1,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  bgcolor: isMe ? SELF_HIGHLIGHT : 'transparent',
                }}
              >
                {/* Largeur fixe : l'image du porteur et les numéros des suivants
                    s'alignent sur la même colonne. */}
                <Box sx={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                  {i === 0 ? (
                    <BadgeMark art={badge} size={24} />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {i + 1}
                    </Typography>
                  )}
                </Box>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: i === 0 || isMe ? 600 : 400,
                    color: isMe ? palette.accent : undefined,
                  }}
                >
                  {entry.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {entry.count} amende{entry.count > 1 ? 's' : ''}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ flexShrink: 0, minWidth: 40, textAlign: 'right', color: palette.text }}
                >
                  {entry.amount} €
                </Typography>
              </Stack>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}
