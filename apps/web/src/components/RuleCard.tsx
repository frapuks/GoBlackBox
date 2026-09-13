import { useState } from 'react'
import { Box, Chip, Collapse, IconButton, Stack, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { Rule } from '@blackbox/shared'
import { Amount, Card, RuleAmount } from './ui'
import { palette } from '../theme'

/**
 * Carte d'une règle, partagée entre la page Règles et l'étape 3 de l'ajout
 * d'amende. Un seul composant, donc les deux écrans ne peuvent pas diverger.
 *
 * La liste ne montre que l'essentiel — libellé et montant. Description et
 * paliers sont repliés derrière le chevron.
 *
 * Deux gestes distincts, pour ne pas sacrifier la saisie en un tap :
 *  - le chevron ouvre les détails, toujours ;
 *  - la ligne déclenche `onSelect` quand il n'y a pas de palier à choisir,
 *    et se contente de déplier sinon.
 */
export const RuleCard = ({
  rule,
  onSelect,
  action,
  selected = false,
}: {
  rule: Rule
  onSelect?: (ruleId: number, tierId?: number) => void
  action?: React.ReactNode
  /** Vrai à l'ajout d'amende, sur la règle retenue tant qu'elle n'est pas validée. */
  selected?: boolean
}) => {
  const hasTiers = rule.tiers.length > 0
  const expandable = hasTiers || Boolean(rule.description)
  const [open, setOpen] = useState(false)
  const archived = rule.archivedAt !== null

  const toggle = () => setOpen((v) => !v)

  // Une règle à paliers ne se donne jamais directement : c'est le palier qui
  // porte le montant, donc la ligne ne peut que déplier.
  const rowAction = hasTiers ? toggle : onSelect ? () => onSelect(rule.id) : expandable ? toggle : undefined

  return (
    <Card
      sx={{
        p: 0,
        overflow: 'hidden',
        opacity: archived ? 0.45 : 1,
        // Même marquage que les joueurs à l'étape 1 : bordure ET fond, la seule
        // bordure passe inaperçue sur un téléphone au soleil.
        border: '2px solid',
        borderColor: selected ? palette.accent : 'transparent',
        bgcolor: selected ? 'rgba(249,115,22,0.12)' : 'background.paper',
      }}
    >
      <Box
        onClick={rowAction}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          cursor: rowAction ? 'pointer' : 'default',
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
        </Box>

        <RuleAmount amount={rule.amount} tiers={rule.tiers} />

        {expandable && (
          <IconButton
            size="small"
            aria-label={open ? 'Masquer les détails' : 'Voir les détails'}
            aria-expanded={open}
            // La ligne a sa propre action : sans ça, ouvrir les détails
            // déclencherait aussi la saisie de l'amende.
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
            sx={{
              color: palette.textMuted,
              transition: 'transform .2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        )}

        {action && <Box onClick={(e) => e.stopPropagation()}>{action}</Box>}
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
          {rule.description && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
              {rule.description}
            </Typography>
          )}

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
                borderTop: '1px solid rgba(148,163,184,0.08)',
              }}
            >
              <Typography sx={{ flex: 1 }}>{t.label}</Typography>
              <Amount amount={t.amount} state="due" />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Card>
  )
}
