import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import GroupsIcon from '@mui/icons-material/Groups'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import ScheduleIcon from '@mui/icons-material/Schedule'
import type { Rule, RuleKind } from '@blackbox/shared'
import {
  useApplyRule,
  useCreateRule,
  useDashboard,
  useMe,
  useRules,
  useSettings,
  useUpdateRule,
  useUpdateSettings,
} from '../api/hooks'
import { Amount, Card, EmptyState, SectionTitle, formatDate } from '../components/ui'
import { palette } from '../theme'

/** Ce que la boîte de dialogue est en train d'éditer. */
type DialogTarget = Rule | { create: RuleKind } | null

export const RulesPage = () => {
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<DialogTarget>(null)

  const me = useMe()
  const rules = useRules(showArchived)
  const settings = useSettings()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'
  const isAdmin = me.data?.user.role === 'ADMIN'

  const dues = rules.data?.filter((r) => r.kind === 'DUES') ?? []
  const penalties = rules.data?.filter((r) => r.kind === 'PENALTY') ?? []
  const fines = rules.data?.filter((r) => r.kind === 'FINE') ?? []

  return (
    <>
      {/* ------------------------------------------------ La caisse */}
      <SectionTitle>La caisse</SectionTitle>

      <Typography variant="overline" color="text.secondary">
        Retard
      </Typography>

      <LateDelayCard lateAfterDays={settings.data?.lateAfterDays} editable={isAdmin} />

      <Stack spacing={1}>
        {penalties.map((r) => (
          <ApplyRuleCard key={r.id} rule={r} isStaff={isStaff} onEdit={() => setEditing(r)} />
        ))}
      </Stack>

      {isStaff && (
        <Button
          startIcon={<AddIcon />}
          sx={{ mt: 1, mb: 2 }}
          onClick={() => setEditing({ create: 'PENALTY' })}
        >
          Nouvelle pénalité de retard
        </Button>
      )}

      <Typography variant="overline" color="text.secondary">
        Cotisations
      </Typography>

      <Stack spacing={1} sx={{ mt: 1 }}>
        {dues.map((r) => (
          <ApplyRuleCard key={r.id} rule={r} isStaff={isStaff} onEdit={() => setEditing(r)} />
        ))}
      </Stack>

      {isStaff && (
        <Button
          startIcon={<AddIcon />}
          sx={{ mt: 1 }}
          onClick={() => setEditing({ create: 'DUES' })}
        >
          Nouvelle cotisation
        </Button>
      )}

      {/* ------------------------------------------------ Les règles */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 4 }}>
        <SectionTitle sx={{ mb: 0 }}>Règles</SectionTitle>
        {isStaff && (
          <Button startIcon={<AddIcon />} onClick={() => setEditing({ create: 'FINE' })}>
            Ajouter
          </Button>
        )}
      </Stack>

      <Box sx={{ mt: 1.5 }}>
        {fines.length === 0 && <EmptyState>Aucune règle</EmptyState>}

        <Stack spacing={1}>
          {fines.map((r) => {
            const archived = r.archivedAt !== null
            return (
              <Card
                key={r.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, opacity: archived ? 0.45 : 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}
                      textTransform="uppercase"
                    >
                      {r.label}
                    </Typography>
                    {archived && <Chip size="small" label="Archivée" sx={{ height: 20 }} />}
                  </Stack>
                  {r.description && (
                    <Typography variant="body2" color="text.secondary">
                      {r.description}
                    </Typography>
                  )}
                </Box>

                <Amount amount={r.amount} state="due" size="lg" />

                {isStaff && (
                  <IconButton size="small" aria-label="Modifier" onClick={() => setEditing(r)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
              </Card>
            )
          })}
        </Stack>
      </Box>

      <FormControlLabel
        sx={{ mt: 2 }}
        control={
          <Switch checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        }
        label={
          <Typography variant="overline" color="text.secondary">
            Afficher les règles archivées
          </Typography>
        }
      />

      <RuleDialog target={editing} onClose={() => setEditing(null)} />
    </>
  )
}

/**
 * Cotisation ou pénalité : les deux se donnent en un clic à un groupe, pas à un
 * fautif choisi. Seule la cible change — toute l'équipe, ou les seuls membres
 * ayant au moins une amende en retard.
 */
const ApplyRuleCard = ({
  rule,
  isStaff,
  onEdit,
}: {
  rule: Rule
  isStaff: boolean
  onEdit: () => void
}) => {
  const applyRule = useApplyRule()
  const dashboard = useDashboard()
  const archived = rule.archivedAt !== null
  const isPenalty = rule.kind === 'PENALTY'

  const members = dashboard.data?.members ?? []
  // Le décompte affiché applique la même règle que le serveur, pour que le
  // bouton ne promette jamais un nombre différent de ce qui sera créé.
  const targets = isPenalty ? members.filter((m) => m.hasLate) : members
  const count = targets.length

  const apply = () => {
    const who = isPenalty
      ? `aux ${count} joueurs ayant une amende en retard`
      : `aux ${count} membres de l'équipe`
    if (confirm(`Appliquer « ${rule.label} » (${rule.amount} €) ${who} ?`)) {
      applyRule.mutate(rule.id)
    }
  }

  return (
    <Card sx={{ opacity: archived ? 0.45 : 1 }}>
      <Stack direction="row" alignItems="center" gap={2}>
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

        <Amount amount={rule.amount} state="due" size="lg" />

        {isStaff && (
          <IconButton size="small" aria-label="Modifier" onClick={onEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {isStaff && !archived && (
        <Button
          fullWidth
          variant="contained"
          color={isPenalty ? 'error' : 'primary'}
          startIcon={isPenalty ? <ReportProblemIcon /> : <GroupsIcon />}
          sx={{ mt: 2 }}
          disabled={applyRule.isPending || count === 0}
          onClick={apply}
        >
          {count === 0
            ? isPenalty
              ? 'Aucun retardataire'
              : 'Aucun membre'
            : isPenalty
              ? `Appliquer aux ${count} retardataires`
              : `Appliquer aux ${count} membres`}
        </Button>
      )}

      {/* Garde-fou principal contre la double cotisation : rien n'empêche
          d'appliquer deux fois, mais on voit immédiatement que c'est déjà fait. */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {rule.lastAppliedAt
          ? 'Dernière application : ' + formatDate(rule.lastAppliedAt)
          : 'Jamais appliquée'}
      </Typography>
    </Card>
  )
}

/**
 * Le délai de retard est une information collective : visible par tous sur
 * cet écran, et modifiable uniquement par l'admin, directement ici.
 */
const LateDelayCard = ({
  lateAfterDays,
  editable,
}: {
  lateAfterDays: number | undefined
  editable: boolean
}) => {
  const updateSettings = useUpdateSettings()
  const [value, setValue] = useState('')

  useEffect(() => {
    if (lateAfterDays !== undefined) setValue(String(lateAfterDays))
  }, [lateAfterDays])

  if (lateAfterDays === undefined) return null

  const dirty = value !== String(lateAfterDays)

  return (
    <Card sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <ScheduleIcon sx={{ color: palette.accent }} />

      {!editable && (
        <Typography variant="body2">
          Une amende est considérée <strong>en retard après {lateAfterDays} jours</strong>.
        </Typography>
      )}

      {editable && (
        <>
          <Typography variant="body2" sx={{ flex: 1 }}>
            En retard après
          </Typography>
          <TextField
            size="small"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputProps={{ min: 1, max: 365 }}
            sx={{ width: 90 }}
          />
          <Typography variant="body2">jours</Typography>
          {dirty && (
            <Button
              size="small"
              variant="contained"
              onClick={() => updateSettings.mutate({ lateAfterDays: Number(value) })}
            >
              OK
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

/**
 * Même formulaire pour créer et pour modifier, cotisation comme règle : les
 * champs sont identiques, seuls le titre et l'action de soumission changent.
 * L'archivage vit ici aussi, et ne s'applique qu'à la validation.
 *
 * Modifier une règle ne touche PAS aux amendes déjà données : elles ont copié
 * le montant et le libellé à leur création.
 */
const RuleDialog = ({ target, onClose }: { target: DialogTarget; onClose: () => void }) => {
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()

  // `rule` non nul = édition, sinon création. TypeScript a besoin du test
  // `'id' in target` sur `target` lui-même pour discriminer l'union.
  const rule = target && 'id' in target ? target : null
  const kind: RuleKind =
    target === null ? 'FINE' : 'id' in target ? target.kind : target.create
  const isDues = kind === 'DUES'
  const isPenalty = kind === 'PENALTY'

  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('5')
  const [archived, setArchived] = useState(false)

  // Recharge le formulaire à chaque ouverture, sinon on repart des valeurs
  // de la règle éditée précédemment.
  useEffect(() => {
    if (target === null) return
    setLabel(rule?.label ?? '')
    setDescription(rule?.description ?? '')
    setAmount(String(rule?.amount ?? (isDues ? 20 : 5)))
    setArchived(rule?.archivedAt != null)
  }, [target, rule, isDues])

  const pending = createRule.isPending || updateRule.isPending

  const submit = () => {
    if (rule) {
      // L'archivage part dans la même requête que le reste : rien n'est
      // appliqué tant que le formulaire n'est pas validé, et « Annuler »
      // annule vraiment tout.
      updateRule.mutate(
        {
          id: rule.id,
          label,
          description: description || null,
          amount: Number(amount),
          archived,
        },
        { onSuccess: onClose },
      )
    } else {
      createRule.mutate(
        { label, description: description || undefined, amount: Number(amount), kind },
        { onSuccess: onClose },
      )
    }
  }

  const noun =
    kind === 'DUES' ? 'la cotisation' : kind === 'PENALTY' ? 'la pénalité' : 'la règle'
  const newNoun =
    kind === 'DUES'
      ? 'Nouvelle cotisation'
      : kind === 'PENALTY'
        ? 'Nouvelle pénalité de retard'
        : 'Nouvelle règle'
  const title = rule ? 'Modifier ' + noun : newNoun

  return (
    <Dialog open={target !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Libellé"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              isDues ? 'Cotisation de saison' : isPenalty ? 'Pénalité de retard' : ''
            }
            autoFocus
            required
          />
          <TextField
            label="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
          />
          <TextField
            label="Montant en euros"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, max: 10000 }}
            helperText={
              isDues
                ? 'Montant dû par chaque membre à chaque application'
                : isPenalty
                  ? 'Montant ajouté à chaque joueur ayant une amende en retard'
                  : '0 € possible : décris alors la sanction dans la description'
            }
          />

          {rule && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Archiver {noun}</Typography>}
              />
              <Typography variant="caption" color="text.secondary">
                Une fois archivée, elle n&apos;est plus proposée à la saisie, mais les
                amendes déjà données restent intactes.
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button variant="contained" onClick={submit} disabled={!label || pending}>
          {rule ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
