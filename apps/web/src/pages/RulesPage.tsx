import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Collapse,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import GroupsIcon from '@mui/icons-material/Groups'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import {
  isDuesLate,
  isPenaltyLate,
  RULE_CONTEXTS,
  RULE_CONTEXT_LABEL,
  type BadgeImage,
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
import { Amount, Card, EmptyState, LateBadge, SectionTitle, formatDate } from '../components/ui'
import { BadgeField } from '../components/badges'
import { RuleCard } from '../components/RuleCard'
import { ToggleButton, ToggleButtonGroup } from '@mui/material'
import { palette } from '../theme'

/** Ce que la boîte de dialogue est en train d'éditer. */
type DialogTarget = Rule | { create: RuleKind } | null

export const RulesPage = () => {
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<DialogTarget>(null)

  const me = useMe()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'

  // Les archivées sont chargées selon le RÔLE, pas selon l'interrupteur : ce
  // dernier ne fait plus qu'afficher ou masquer. Sans ça, chaque bascule
  // change la clé de requête, vide la liste le temps du rechargement et fait
  // sauter tout l'écran. Un joueur ne les reçoit pas du tout.
  const rules = useRules(isStaff)

  // Sections coupées par l'admin : on masque plutôt que de laisser un titre
  // et un bouton pour une fonctionnalité que l'équipe n'utilise pas.

  // Les trois sections ne montrent que l'actif, quel que soit l'interrupteur :
  // une règle archivée n'a rien à faire au milieu de celles qu'on applique.
  const all = rules.data ?? []
  const active = all.filter((r) => r.archivedAt === null)
  const archived = all.filter((r) => r.archivedAt !== null)

  const dues = active.filter((r) => r.kind === 'DUES')
  const penalties = active.filter((r) => r.kind === 'PENALTY')
  const fines = active.filter((r) => r.kind === 'FINE')

  // Une seule pénalité, une seule cotisation. Absente, sa place devient une
  // ligne d'ajout pour les gestionnaires, plutôt qu'un « + » isolé dans un
  // titre : on voit ce qui manque à l'endroit où ça devrait être.
  const applyRows = [
    {
      key: 'penalty',
      node: penalties[0] ? (
        <ApplyRuleCard
          embedded
          rule={penalties[0]}
          isStaff={isStaff}
          onEdit={() => setEditing(penalties[0]!)}
        />
      ) : isStaff ? (
        <AddApplyRow kind="PENALTY" onClick={() => setEditing({ create: 'PENALTY' })} />
      ) : null,
    },
    {
      key: 'dues',
      node: dues[0] ? (
        <ApplyRuleCard
          embedded
          rule={dues[0]}
          isStaff={isStaff}
          onEdit={() => setEditing(dues[0]!)}
        />
      ) : isStaff ? (
        <AddApplyRow kind="DUES" onClick={() => setEditing({ create: 'DUES' })} />
      ) : null,
    },
  ].filter((row): row is { key: string; node: React.ReactElement } => Boolean(row && row.node))

  return (
    <>
      {/* ------------------------------------- Pénalité et cotisation */}
      {/* Un seul bloc, et d'une autre facture que les règles : ces deux-là ne
          se donnent pas à un fautif, elles s'APPLIQUENT à un groupe d'un geste.
          Les règles sont des cartes pleines, celles-ci des cadres à simple
          contour — la différence se voit avant même de lire les titres. */}
      {applyRows.length > 0 && (
        <>
          <SectionHeader title="Pénalité et cotisation" first />
          {/* Un cadre par règle : pénalité et cotisation n'ont rien en commun que
              leur façon de s'appliquer, elles ne partagent donc que le titre. */}
          <Stack spacing={1}>
            {applyRows.map((row) => (
              <Box
                key={row.key}
                sx={{
                  border: '1px solid rgba(148,163,184,0.22)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                {row.node}
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* ----------------------------------------------------- Règles */}
      <SectionHeader
        title="Règles"
        onAdd={isStaff ? () => setEditing({ create: 'FINE' }) : undefined}
        addLabel="Ajouter une règle"
        first={applyRows.length === 0}
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

      {/* Consulter l'archive ne concerne que ceux qui peuvent désarchiver. */}
      {isStaff && (
        <>
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

          {/* Toutes sortes confondues, sous l'interrupteur : le contenu
              n'apparaît qu'en bas de page, donc rien ne bouge au-dessus. Pas de
              titre — celui de l'interrupteur, juste au-dessus, le dit déjà. */}
          <Collapse in={showArchived} unmountOnExit>
            {archived.length === 0 ? (
              <EmptyState>Aucune règle archivée</EmptyState>
            ) : (
              <Stack spacing={1} sx={{ mt: 1 }}>
                {archived.map((r) =>
                  r.kind === 'FINE' ? (
                    <RuleCard
                      key={r.id}
                      rule={r}
                      action={
                        <IconButton size="small" aria-label="Modifier" onClick={() => setEditing(r)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      }
                    />
                  ) : (
                    <ApplyRuleCard
                      key={r.id}
                      rule={r}
                      isStaff={isStaff}
                      onEdit={() => setEditing(r)}
                    />
                  ),
                )}
              </Stack>
            )}
          </Collapse>
        </>
      )}

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
  addLabel,
  first = false,
}: {
  title: string
  onAdd?: () => void
  /** Décrit ce que le « + » ajoute : c'est le seul texte pour un lecteur d'écran. */
  addLabel?: string
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
      <IconButton size="small" color="primary" aria-label={addLabel} onClick={onAdd}>
        <AddIcon />
      </IconButton>
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
  embedded = false,
}: {
  rule: Rule
  isStaff: boolean
  onEdit: () => void
  /** Posée dans le bloc de la page : pas de fond ni de coins propres, c'est le cadre qui les porte. */
  embedded?: boolean
}) => {
  const applyRule = useApplyRule()
  const dashboard = useDashboard()
  const lateAfterDays = useSettings().data?.lateAfterDays
  const [open, setOpen] = useState(false)
  const archived = rule.archivedAt !== null
  const isPenalty = rule.kind === 'PENALTY'

  // Le décompte affiché applique la même règle que le serveur, pour que le
  // bouton ne promette jamais un nombre différent de ce qui sera créé.
  //
  // Contrairement au classement, l'exclusion est ici SANS exception : un
  // participant hors amendes n'est jamais la cible d'une application, même s'il
  // a un historique.
  const members = (dashboard.data?.members ?? []).filter((m) => m.receivesFines)

  // Une cotisation compte des membres. Une pénalité compte des AMENDES : elle
  // en crée une par amende en retard non majorée, pas une par joueur. Le
  // décompte vient du serveur, calculé avec le même fragment SQL que
  // l'application elle-même.
  const penalized = members.filter((m) => m.penalizableCount > 0)
  const count = isPenalty
    ? penalized.reduce((sum, m) => sum + m.penalizableCount, 0)
    : members.length

  const [confirming, setConfirming] = useState(false)
  const Wrapper = embedded ? Box : Card

  return (
    <Wrapper sx={{ p: 0, overflow: 'hidden', opacity: archived ? 0.45 : 1 }}>
      {/* Repliée, la carte ne montre que l'essentiel. Description, date de
          dernière application et bouton d'application vivent dans le panneau. */}
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer' }}
      >
        <KindIcon kind={rule.kind} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography
              sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}
              textTransform="uppercase"
            >
              {rule.label}
            </Typography>
            {archived && <Chip size="small" label="Archivée" sx={{ height: 20 }} />}
            {/* Rien ne se déclenche tout seul : c'est un rappel, pas un état.
                La cotisation réclame chaque mois ; la pénalité quand le délai
                de retard est écoulé depuis sa dernière application, et qu'il reste
                une amende à majorer. */}
            {(isPenalty
              ? isPenaltyLate(rule, lateAfterDays, count > 0)
              : isDuesLate(rule)) && <LateBadge />}
          </Stack>

          {/* Sous le libellé, ce qui fait réclamer la règle : sans lui, « en
              retard » ne dirait pas en retard de quoi. Pour la pénalité, c'est le
              délai — et il doit rester lisible par tout le monde, puisqu'il dit
              aussi à partir de quand une amende devient rouge. */}
          {isPenalty
            ? lateAfterDays !== undefined && (
                <Typography variant="caption" color="text.secondary">
                  En retard après {lateAfterDays} jours
                </Typography>
              )
            : (
                <Typography variant="caption" color="text.secondary">
                  Chaque mois
                </Typography>
              )}
        </Box>

        <Amount amount={rule.amount} state="due" size="lg" />

        <IconButton
          size="small"
          aria-label={open ? 'Masquer les détails' : 'Voir les détails'}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
          sx={{
            color: palette.textMuted,
            transition: 'transform .2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        >
          <ExpandMoreIcon fontSize="small" />
        </IconButton>

        {isStaff && (
          <Box onClick={(e) => e.stopPropagation()}>
            <IconButton size="small" aria-label="Modifier" onClick={onEdit}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 2, borderTop: '1px solid rgba(148,163,184,0.15)', pt: 1.5 }}>
          {rule.description && (
            <Typography variant="body2" color="text.secondary">
              {rule.description}
            </Typography>
          )}

          {/* Garde-fou principal contre la double application : rien ne
              l'empêche, mais on voit immédiatement que c'est déjà fait. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {rule.lastAppliedAt
              ? 'Dernière application : ' + formatDate(rule.lastAppliedAt)
              : 'Jamais appliquée'}
          </Typography>

          {isStaff && !archived && (
            <Button
              fullWidth
              variant="contained"
              color={isPenalty ? 'error' : 'primary'}
              startIcon={isPenalty ? <ReportProblemIcon /> : <GroupsIcon />}
              sx={{ mt: 2 }}
              disabled={applyRule.isPending || count === 0}
              onClick={() => setConfirming(true)}
            >
              {count === 0
                ? isPenalty
                  ? 'Aucune amende à majorer'
                  : 'Aucun membre'
                : isPenalty
                  ? `Majorer ${count} amende${count > 1 ? 's' : ''}`
                  : `Appliquer aux ${count} membres`}
            </Button>
          )}
        </Box>
      </Collapse>

      <ApplyDialog
        rule={rule}
        count={count}
        playerCount={isPenalty ? penalized.length : members.length}
        open={confirming}
        pending={applyRule.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => applyRule.mutate(rule.id, { onSuccess: () => setConfirming(false) })}
      />
    </Wrapper>
  )
}

/**
 * L'emblème d'une pénalité ou d'une cotisation, en tête de sa ligne.
 *
 * Il distingue les deux d'un coup d'oeil, et les distingue surtout des règles,
 * qui n'en ont pas. Rouge pour la pénalité, jaune pour la cotisation : les
 * couleurs de « en retard » et de « à payer », puisque c'est ce qu'elles créent.
 */
const KindIcon = ({ kind }: { kind: RuleKind }) => {
  const isPenalty = kind === 'PENALTY'
  const color = isPenalty ? palette.danger : palette.accentSoft
  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        bgcolor: isPenalty ? 'rgba(239,68,68,0.14)' : 'rgba(250,204,21,0.14)',
      }}
    >
      {isPenalty ? <ReportProblemIcon fontSize="small" /> : <GroupsIcon fontSize="small" />}
    </Box>
  )
}

/** La place d'une pénalité ou d'une cotisation pas encore créée. Gestionnaires seulement. */
const AddApplyRow = ({ kind, onClick }: { kind: RuleKind; onClick: () => void }) => (
  <ButtonBase
    onClick={onClick}
    sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 2, textAlign: 'left' }}
  >
    <KindIcon kind={kind} />
    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
      {kind === 'PENALTY' ? 'Ajouter une pénalité de retard' : 'Ajouter une cotisation'}
    </Typography>
    <AddIcon sx={{ color: palette.accent }} />
  </ButtonBase>
)

/**
 * Confirmation d'une application en masse.
 *
 * Une application touche toute une partie de l'effectif d'un coup et ne
 * s'annule pas d'un geste : la boîte annonce donc le montant total engagé et
 * rappelle la dernière application, seul garde-fou contre le double débit.
 */
const ApplyDialog = ({
  rule,
  count,
  playerCount,
  open,
  pending,
  onClose,
  onConfirm,
}: {
  rule: Rule
  /** Amendes créées : une par membre pour une cotisation, une par amende majorée sinon. */
  count: number
  /** Joueurs touchés. Égal à `count` pour une cotisation, souvent moins pour une pénalité. */
  playerCount: number
  open: boolean
  pending: boolean
  onClose: () => void
  onConfirm: () => void
}) => {
  const isPenalty = rule.kind === 'PENALTY'
  const lateAfterDays = useSettings().data?.lateAfterDays

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isPenalty ? 'Appliquer la pénalité' : 'Appliquer la cotisation'}</DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <Typography
            sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}
            textTransform="uppercase"
          >
            {rule.label}
          </Typography>

          {/* Le total engagé : c'est l'information qui manque le plus au moment
              de décider, et elle n'apparaît nulle part ailleurs. */}
          <Card sx={{ bgcolor: 'rgba(148,163,184,0.08)', textAlign: 'center', py: 2 }}>
            <Typography variant="overline" color="text.secondary">
              {isPenalty
                ? `${count} amende${count > 1 ? 's' : ''} × ${rule.amount} €`
                : `${count} membre${count > 1 ? 's' : ''} × ${rule.amount} €`}
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '2.5rem',
                lineHeight: 1.1,
                color: isPenalty ? palette.danger : palette.accentSoft,
              }}
            >
              + {count * rule.amount} €
            </Typography>
          </Card>

          {/* Ce qui va se passer, dans l'ordre où ça se passe. Pour une pénalité
              le mécanisme n'est pas évident — une par amende, pas par joueur, et
              une protection temporaire —, d'où le détail. */}
          {isPenalty ? (
            <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                Une pénalité de {rule.amount} € pour chacune des {count} amende
                {count > 1 ? 's' : ''} en retard, réparties sur {playerCount} joueur
                {playerCount > 1 ? 's' : ''}.
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Ces amendes passent{' '}
                <Box component="span" sx={{ color: palette.accent, fontWeight: 600 }}>
                  majorées
                </Box>{' '}
                pendant {lateAfterDays ?? '…'} jours.
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Une amende sera ajoutée à chaque membre de l&apos;équipe, sans exception.
            </Typography>
          )}

          {/* L'avertissement de double application ne vaut plus que pour la
              cotisation : la pénalité se protège d'elle-même, amende par amende. */}
          {!isPenalty && rule.lastAppliedAt && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(250,204,21,0.10)',
                color: palette.accentSoft,
              }}
            >
              <ReportProblemIcon fontSize="small" />
              <Typography variant="body2">
                Déjà appliquée le {formatDate(rule.lastAppliedAt)}.
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          color={isPenalty ? 'error' : 'primary'}
          onClick={onConfirm}
          disabled={pending}
        >
          Appliquer
        </Button>
      </DialogActions>
    </Dialog>
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
  const settings = useSettings()
  const updateSettings = useUpdateSettings()

  // `rule` non nul = édition, sinon création. TypeScript a besoin du test
  // `'id' in target` sur `target` lui-même pour discriminer l'union.
  const rule = target && 'id' in target ? target : null
  const kind: RuleKind = target === null ? 'FINE' : 'id' in target ? target.kind : target.create
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
  const [badgeIcon, setBadgeIcon] = useState<BadgeImage | null>(null)
  // Le délai de retard vit dans les réglages de la caisse, pas sur la règle :
  // il décide de la couleur de CHAQUE amende, pas seulement des pénalités. Il
  // se modifie ici parce que c'est le seul endroit où il veut dire quelque
  // chose, et parce qu'il n'existe plus qu'une pénalité.
  const [lateDays, setLateDays] = useState('')
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
    setBadgeIcon(rule?.badgeIcon ?? null)
    setLateDays(String(settings.data?.lateAfterDays ?? 30))
    setArchived(rule?.archivedAt != null)
  }, [target, rule, isDues, settings.data?.lateAfterDays])

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

  // Vrai seulement quand la validation va RETIRER la règle des écrans.
  const archiving = archived && rule?.archivedAt == null

  const submit = () => {
    // Le délai part dans sa propre requête, vers les réglages : il ne vit pas
    // sur la règle. Envoyé avant, et seulement s'il a changé — une requête de
    // plus à chaque ouverture du formulaire n'apprendrait rien au serveur.
    if (isPenalty && Number(lateDays) > 0 && Number(lateDays) !== settings.data?.lateAfterDays) {
      updateSettings.mutate({ lateAfterDays: Number(lateDays) })
    }

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
          badgeIcon,
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
          badgeIcon,
          tiers: cleanTiers,
        },
        { onSuccess: onClose },
      )
    }
  }

  const noun = kind === 'DUES' ? 'la cotisation' : kind === 'PENALTY' ? 'la pénalité' : 'la règle'
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
            placeholder={isDues ? 'Cotisation de saison' : isPenalty ? 'Pénalité de retard' : ''}
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

          {/* Le délai vaut pour TOUTE la caisse — c'est lui qui rend une amende
              rouge dans le fil — mais il ne se règle que là où il sert. */}
          {isPenalty && (
            <TextField
              label="En retard après (jours)"
              type="number"
              value={lateDays}
              onChange={(e) => setLateDays(e.target.value)}
              inputProps={{ min: 1, max: 365 }}
            />
          )}

          {/* Ouvert à tous les types de règle, cotisation et pénalité de
              retard comprises : à chacun de juger si la distinction l'amuse. */}
          <BadgeField heading label="Badge du champion" value={badgeIcon} onChange={setBadgeIcon} />

          {rule && (
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Archivage
              </Typography>
              <FormControlLabel
                control={
                  <Switch checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                }
                label={<Typography variant="body2">Archiver {noun}</Typography>}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        {/* Archiver part dans la même requête que le reste, mais c'est la seule
            action du formulaire qui retire quelque chose de l'écran : le bouton
            l'annonce, et en rouge. Comparé à l'état ACTUEL de la règle — rouvrir
            une règle déjà archivée ne réarchive rien. */}
        <Button
          variant="contained"
          color={archiving ? 'error' : 'primary'}
          onClick={submit}
          disabled={!label || incomplete || pending}
        >
          {archiving ? 'Archiver' : rule ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
