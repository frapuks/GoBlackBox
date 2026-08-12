import { useState } from 'react'
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { Rule } from '@blackbox/shared'
import { Amount, Card, RuleAmount } from './ui'
import { palette } from '../theme'

/**
 * Carte d'une règle, partagée entre la page Règles et l'étape 3 de l'ajout
 * d'amende. Un seul composant, donc les deux écrans ne peuvent pas diverger.
 *
 * Avec `onSelect`, la carte est actionnable : une règle à montant unique se
 * donne au tap, une règle à paliers se déplie et c'est le palier qu'on tape.
 * Sans `onSelect`, elle est en lecture seule et ne fait que se déplier.
 */
export const RuleCard = ({
  rule,
  onSelect,
  action,
}: {
  rule: Rule
  onSelect?: (ruleId: number, tierId?: number) => void
  action?: React.ReactNode
}) => {
  const hasTiers = rule.tiers.length > 0
  const [open, setOpen] = useState(false)
  const archived = rule.archivedAt !== null

  // Une règle à paliers ne se donne jamais directement : c'est le palier qui
  // porte le montant, donc le tap sur l'en-tête ne peut que déplier.
  const headerAction = hasTiers
    ? () => setOpen((v) => !v)
    : onSelect
      ? () => onSelect(rule.id)
      : undefined

  return (
    <Card sx={{ p: 0, overflow: 'hidden', opacity: archived ? 0.45 : 1 }}>
      <Box
        onClick={headerAction}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          cursor: headerAction ? 'pointer' : 'default',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}
              textTransform="uppercase"
            >
              {rule.label}
            </Typography>
            {archived && <Chip size="small" label="Archivée" sx={{ height: 20 }} />}
          </Stack>
          {rule.description && (
            <Typography variant="body2" color="text.secondary">
              {rule.description}
            </Typography>
          )}
        </Box>

        <RuleAmount amount={rule.amount} tiers={rule.tiers} />

        {hasTiers && (
          <ExpandMoreIcon
            sx={{
              color: palette.textMuted,
              transition: 'transform .2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        )}

        {action}
      </Box>

      <Collapse in={open} unmountOnExit>
        <Stack sx={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
          {rule.tiers.map((t) => (
            <Box
              key={t.id}
              onClick={onSelect ? () => onSelect(rule.id, t.id) : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2,
                py: 1.75,
                cursor: onSelect ? 'pointer' : 'default',
                borderBottom: '1px solid rgba(148,163,184,0.08)',
              }}
            >
              <Typography sx={{ flex: 1 }}>{t.label}</Typography>
              <Amount amount={t.amount} state="due" />
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Card>
  )
}
