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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import GroupsIcon from '@mui/icons-material/Groups'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import ScheduleIcon from '@mui/icons-material/Schedule'
import {
  RULE_CONTEXTS,
  RULE_CONTEXT_LABEL,
  type Rule,
  type RuleContext,
  type RuleKind,
} from '@blackbox/shared'
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
import { RuleCard } from '../components/RuleCard'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
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
      {/* ------------------------------------------- Retard de paiement */}
      <SectionHeader
        title="Retard de paiement"
        onAdd={isStaff ? () => setEditing({ create: 'PENALTY' }) : undefined}
        first
      />

      <LateDelayCard lateAfterDays={settings.data?.lateAfterDays} editable={isAdmin} />

      <Stack spacing={1}>
        {penalties.map((r) => (
          <ApplyRuleCard key={r.id} rule={r} isStaff={isStaff} onEdit={() => setEditing(r)} />
        ))}
      </Stack>

      {/* ------------------------------------------------- Cotisation */}
      <SectionHeader
        title="Cotisation"
        onAdd={isStaff ? () => setEditing({ create: 'DUES' }) : undefined}
      />

      {dues.length === 0 && <EmptyState>Aucune cotisation</EmptyState>}

      <Stack spacing={1}>
        {dues.map((r) => (
          <ApplyRuleCard key={r.id} rule={r} isStaff={isStaff} onEdit={() => setEditing(r)} />
        ))}
      </Stack>

      {/* ----------------------------------------------------- Règles */}
      <SectionHeader
        title="Règles"
        onAdd={isStaff ? () => setEditing({ create: 'FINE' }) : undefined}
      />

      {fines.length === 0 && <EmptyState>Aucune règle</EmptyState>}

      {RULE_CONTEXTS.filter((c) => fines.some((r) => r.context === c)).map((context) => (
        <Box key={context} sx={{ mb: 2 }}>
          <Typography variant="overline" color="text.secondary">
            {RULE_CONTEXT_LABEL[context]}
          </Typography>

          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {fines
              .filter((r) => r.context === context)
              .map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  action={
                    isStaff ? (
                      <IconButton size="small" aria-label="Modifier" onClick={() => setEditing(r)}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    ) : undefined
                  }
                />
              ))}
          </Stack>
        </Box>
      ))}

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
 * Titre de section avec son bouton « Ajouter » aligné à droite.
 *
 * Le passer par un composant plutôt que d'enchaîner un titre puis un bouton
 * dans le flux : sans conteneur en ligne, le bouton et le titre suivant se
 * retrouvent côte à côte au lieu de s'empiler.
 */
const SectionHeader = ({
  title,
  onAdd,
  first = false,
}: {
  title: string
  onAdd?: () => void
  first?: boolean
}) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    sx={{ mt: first ? 0 : 4, mb: 1.5, minHeight: 40 }}
  >
    <SectionTitle sx={{ mb: 0 }}>{title}</SectionTitle>
    {onAdd && (
      <Button startIcon={<AddIcon />} onClick={onAdd}>
        Ajouter
      </Button>
    )}
  </Stack>
)

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
  const [context, setContext] = useState<RuleContext>('OTHER')
  const [tiers, setTiers] = useState<{ label: string; amount: string }[]>([])
  // Le mode est choisi AVANT de saisir : sans lui, on remplit un montant que
  // l'ajout d'un palier vient effacer, ce qui donne l'impression d'avoir
  // travaillé pour rien.
  const [mode, setMode] = useState<'SIMPLE' | 'TIERS'>('SIMPLE')
  const [archived, setArchived] = useState(false)

  // Recharge le formulaire à chaque ouverture, sinon on repart des valeurs
  // de la règle éditée précédemment.
  useEffect(() => {
    if (target === null) return
    setLabel(rule?.label ?? '')
    setDescription(rule?.description ?? '')
    setAmount(String(rule?.amount ?? (isDues ? 20 : 5)))
    setContext(rule?.context ?? 'OTHER')
    setTiers((rule?.tiers ?? []).map((t) => ({ label: t.label, amount: String(t.amount) })))
    setMode(rule?.tiers.length ? 'TIERS' : 'SIMPLE')
    setArchived(rule?.archivedAt != null)
  }, [target, rule, isDues])

  const pending = createRule.isPending || updateRule.isPending

  // Un palier sans libellé est ignoré : c'est une ligne que l'utilisateur a
  // ajoutée puis laissée vide, pas une intention.
  const cleanTiers =
    mode === 'TIERS'
      ? tiers
          .filter((t) => t.label.trim())
          .map((t) => ({ label: t.label.trim(), amount: Number(t.amount) || 0 }))
      : []

  // Les deux états cohabitent en mémoire : basculer d'un mode à l'autre puis
  // revenir ne perd rien. C'est la soumission qui tranche.
  const incomplete = mode === 'TIERS' && cleanTiers.length === 0

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
          amount: cleanTiers.length ? 0 : Number(amount),
          context,
          tiers: cleanTiers,
          archived,
        },
        { onSuccess: onClose },
      )
    } else {
      createRule.mutate(
        {
          label,
          description: description || undefined,
          amount: cleanTiers.length ? 0 : Number(amount),
          kind,
          context,
          tiers: cleanTiers,
        },
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
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
          />
          {kind === 'FINE' && (
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Tarification
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={mode}
                onChange={(_, v: 'SIMPLE' | 'TIERS' | null) => {
                  if (!v) return
                  setMode(v)
                  // Une ligne prête à remplir : sans elle, le mode « Paliers »
                  // s'ouvre sur un écran vide qui n'invite à rien.
                  if (v === 'TIERS' && tiers.length === 0) setTiers([{ label: '', amount: '5' }])
                }}
              >
                <ToggleButton value="SIMPLE">Montant unique</ToggleButton>
                <ToggleButton value="TIERS">Paliers</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          )}

          {/* Une règle à paliers n'a pas de montant propre : c'est le palier
              qui décide. Les deux formulaires sont donc exclusifs. */}
          {mode === 'SIMPLE' && (
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
                    : undefined
              }
            />
          )}

          {mode === 'TIERS' && kind === 'FINE' && (
            <Stack spacing={1}>
              {tiers.map((t, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    label="Libellé"
                    placeholder="0 à 5 min"
                    value={t.label}
                    onChange={(e) =>
                      setTiers((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="€"
                    type="number"
                    value={t.amount}
                    onChange={(e) =>
                      setTiers((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                      )
                    }
                    inputProps={{ min: 0, max: 10000 }}
                    sx={{ width: 90 }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Supprimer le palier"
                    onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}

              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setTiers((prev) => [...prev, { label: '', amount: '5' }])}
                sx={{ alignSelf: 'flex-start' }}
              >
                Ajouter un palier
              </Button>
            </Stack>
          )}

          {kind === 'FINE' && (
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Contexte
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={context}
                onChange={(_, v: RuleContext | null) => v && setContext(v)}
              >
                {RULE_CONTEXTS.map((c) => (
                  <ToggleButton key={c} value={c}>
                    {RULE_CONTEXT_LABEL[c]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          )}

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
        <Button variant="contained" onClick={submit} disabled={!label || incomplete || pending}>
          {rule ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
