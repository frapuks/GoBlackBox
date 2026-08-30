import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import LockResetIcon from '@mui/icons-material/LockReset'
import type { MemberSummary } from '@blackbox/shared'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import {
  useCreateMember,
  useLogout,
  useMe,
  useMembers,
  useRegenerateInviteCode,
  useResetPassword,
  useSettings,
  useUpdateMe,
  useUnlinkMember,
  useUpdateFeatures,
  useUpdateMember,
  useUpdateRole,
  useUpdateSettings,
} from '../api/hooks'
import { usePush } from '../api/push'
import { Card, Initials, SectionTitle } from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DateField, DateRangeField } from '../components/DateFields'
import { palette } from '../theme'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card sx={{ mb: 2 }}>
    <Stack spacing={2}>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      {children}
    </Stack>
  </Card>
)

/**
 * Écran unique : profil et mot de passe pour tout le monde, plus les réglages
 * d'administration en dessous si le compte est ADMIN. Une page de moins à
 * naviguer, et l'admin trouve tout au même endroit.
 */
export const SettingsPage = () => {
  const me = useMe()
  const isAdmin = me.data?.user.role === 'ADMIN'
  const isStaff = isAdmin || me.data?.user.role === 'MANAGER'

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={RouterLink} to="/" aria-label="Retour">
          <ArrowBackIcon />
        </IconButton>
        <SectionTitle sx={{ mb: 0 }}>Réglages</SectionTitle>
      </Stack>

      <ProfileSection />
      <NotificationsSection />
      <PasswordSection />

      {isStaff && (
        <>
          <Divider sx={{ my: 3 }}>
            <Typography variant="overline" color="text.secondary">
              Administration
            </Typography>
          </Divider>

          {/* Un gestionnaire administre le quotidien : code d'invitation,
              participants. Restent à l'admin seul les deux décisions qui
              engagent l'équipe — les rôles et l'ouverture des signalements. */}
          <KittyDatesSection />
          <FeaturesSection canEdit={isAdmin} />
          <InviteCodeSection canRegenerate={isAdmin} />
          <MembersSection canManage={isAdmin} />
        </>
      )}

      <LogoutSection />
    </>
  )
}

const ProfileSection = () => {
  const me = useMe()
  const updateMe = useUpdateMe()
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (me.data?.member) setDisplayName(me.data.member.displayName)
  }, [me.data])

  return (
    <Section title="Profil">
      <TextField
        label="Nom affiché"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <Button
        variant="contained"
        onClick={() => updateMe.mutate({ displayName })}
        disabled={updateMe.isPending}
      >
        Enregistrer
      </Button>
      {updateMe.error && <Alert severity="error">{updateMe.error.message}</Alert>}
    </Section>
  )
}

/**
 * Notifications push, réglées par appareil.
 *
 * L'interrupteur reflète l'abonnement réel du navigateur, pas une préférence
 * stockée : couper supprime l'abonnement, donc plus rien ne peut être envoyé.
 */
const NotificationsSection = () => {
  const push = usePush()

  // Pas de clés VAPID côté serveur : rien à proposer, on masque la section
  // plutôt que d'afficher un réglage inopérant.
  if (!push.available) return null

  const message: Record<string, string> = {
    'ios-not-installed':
      "Sur iPhone, les notifications n'existent que si l'app est installée sur l'écran d'accueil : bouton Partager dans Safari, puis « Sur l'écran d'accueil ».",
    denied:
      'Les notifications ont été refusées pour ce site. Réautorise-les dans les réglages de ton navigateur.',
    unsupported: "Ce navigateur ne gère pas les notifications.",
  }

  return (
    <Section title="Notifications">
      <FormControlLabel
        sx={{ ml: 0, justifyContent: 'space-between' }}
        labelPlacement="start"
        control={
          <Switch
            checked={push.subscribed}
            disabled={push.blocker !== null || push.busy}
            onChange={(e) => (e.target.checked ? push.subscribe() : push.unsubscribe())}
          />
        }
        label={
          <Typography variant="body2">Me prévenir quand je reçois une amende</Typography>
        }
      />

      {push.blocker && (
        <Typography variant="caption" color="text.secondary">
          {message[push.blocker]}
        </Typography>
      )}

      {push.error && <Alert severity="error">{push.error}</Alert>}

    </Section>
  )
}

const PasswordSection = () => {
  const updateMe = useUpdateMe()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const tooShort = newPassword.length > 0 && newPassword.length < 8
  // On n'alerte qu'une fois la confirmation commencée : signaler une
  // divergence dès le premier caractère tapé serait du bruit.
  const mismatch = confirmation.length > 0 && confirmation !== newPassword

  const valid =
    currentPassword.length > 0 && newPassword.length >= 8 && confirmation === newPassword

  return (
    <Section title="Mot de passe">
      {/* Les trois champs réservent la place de leur message d'aide, y compris
          quand ils n'en ont pas : sinon les écarts diffèrent d'un champ à
          l'autre, et l'apparition d'une erreur décale le bouton.
          L'espacement du groupe est réduit d'autant, la place réservée
          faisant déjà office de respiration. */}
      <Stack spacing={1}>
        <TextField
          label="Mot de passe actuel"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          helperText=" "
        />
        <TextField
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={tooShort}
          helperText={tooShort ? '8 caractères minimum' : ' '}
        />
        <TextField
          label="Confirmer le nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={mismatch}
          helperText={mismatch ? 'Les deux mots de passe ne correspondent pas' : ' '}
        />
        <Button
          variant="contained"
          disabled={!valid || updateMe.isPending}
          onClick={() =>
            updateMe.mutate(
              { currentPassword, newPassword },
              {
                onSuccess: () => {
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmation('')
                },
              },
            )
          }
        >
          Changer le mot de passe
        </Button>
      </Stack>
    </Section>
  )
}

/**
 * Dates de la caisse — purement informatives, affichées sur le Classement.
 *
 * Aucune ne ferme quoi que ce soit : passé la date de fin, on continue de
 * saisir des amendes. Elles servent à ce que l'équipe sache où elle va, et
 * restent modifiables quand le programme se précise.
 */
const KittyDatesSection = () => {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()

  const [endDate, setEndDate] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  })

  useEffect(() => {
    if (!settings.data) return
    setEndDate(settings.data.endDate)
    setUsage({ start: settings.data.usageStartDate, end: settings.data.usageEndDate })
  }, [settings.data])

  const saved = settings.data
  const dirty =
    saved !== undefined &&
    (endDate !== saved.endDate ||
      usage.start !== saved.usageStartDate ||
      usage.end !== saved.usageEndDate)

  return (
    <Section title="Dates de la caisse">
      {/* Deux champs bâtis sur le même calendrier : aucun sélecteur natif ici,
          dont l'apparence varie d'un système à l'autre et jure avec le reste.
          Ni l'un ni l'autre ne peut produire une valeur incohérente, donc le
          formulaire n'a rien à valider avant l'envoi. */}
      <DateField
        label="Fin de la caisse"
        helperText="Purement indicatif : rien ne se ferme à cette date"
        value={endDate}
        onChange={setEndDate}
      />

      <DateRangeField
        label="Utilisation"
        helperText="Un jour, ou une période — un week-end par exemple"
        start={usage.start}
        end={usage.end}
        onChange={(start, end) => setUsage({ start, end })}
      />

      <Button
        variant="contained"
        disabled={!dirty || updateSettings.isPending}
        onClick={() =>
          updateSettings.mutate({
            // Les trois partent ensemble : le formulaire décrit un état
            // complet, pas une retouche.
            endDate,
            usageStartDate: usage.start,
            usageEndDate: usage.end,
          })
        }
      >
        Enregistrer
      </Button>

      {updateSettings.error && <Alert severity="error">{updateSettings.error.message}</Alert>}
    </Section>
  )
}

/**
 * Ce que l'équipe utilise réellement. Couper une fonctionnalité fait
 * disparaître la section correspondante au lieu de laisser un écran encombré
 * de choses inutilisées.
 */
const FeaturesSection = ({ canEdit }: { canEdit: boolean }) => {
  const settings = useSettings()
  const updateFeatures = useUpdateFeatures()

  const toggle = (
    label: string,
    value: boolean | undefined,
    field: 'allowPlayerReports' | 'enablePenalties' | 'enableDues',
    fallback: boolean,
  ) => (
    <FormControlLabel
      sx={{ ml: 0, justifyContent: 'space-between' }}
      labelPlacement="start"
      control={
        <Switch
          checked={value ?? fallback}
          disabled={!canEdit || settings.isPending || updateFeatures.isPending}
          onChange={(e) => updateFeatures.mutate({ [field]: e.target.checked })}
        />
      }
      label={<Typography variant="body2">{label}</Typography>}
    />
  )

  return (
    <Section title="Fonctionnalités">
      <Stack spacing={0}>
        {toggle('Pénalités de retard', settings.data?.enablePenalties, 'enablePenalties', true)}
        {toggle('Cotisations', settings.data?.enableDues, 'enableDues', true)}
        {toggle(
          'Signalements par les joueurs',
          settings.data?.allowPlayerReports,
          'allowPlayerReports',
          false,
        )}
      </Stack>

      {/* Un interrupteur grisé sans explication laisse croire à une panne. */}
      {!canEdit && (
        <Typography variant="caption" color="text.secondary">
          Modifiable par l&apos;administrateur.
        </Typography>
      )}
    </Section>
  )
}

/**
 * Message d'invitation prêt à coller dans une conversation d'équipe.
 *
 * L'URL vient de `window.location.origin` : elle suit donc le domaine réel,
 * sans valeur en dur à maintenir entre le local et le Raspberry Pi.
 */
const invitationText = (code: string) =>
  [
    "Rejoins la caisse noire de l'équipe 🤾",
    '',
    `1. Ouvre ${window.location.origin}`,
    `2. Crée ton compte avec le code : ${code}`,
    '3. Choisis ton nom dans la liste',
    '',
    "Pour l'installer comme une appli sur ton téléphone :",
    '',
    '• iPhone — ouvre le lien dans Safari, bouton Partager, puis',
    "  « Sur l'écran d'accueil ».",
    '• Android — ouvre le lien dans Chrome, menu ⋮, puis',
    "  « Ajouter à l'écran d'accueil ».",
  ].join('\n')

/**
 * `navigator.clipboard` exige un contexte sécurisé : il est absent en HTTP
 * simple, par exemple si tu ouvres l'app par l'IP du Pi. D'où le repli sur
 * la vieille méthode, qui fonctionne partout.
 */
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

const InviteCodeSection = ({ canRegenerate }: { canRegenerate: boolean }) => {
  const settings = useSettings()
  const regenerate = useRegenerateInviteCode()
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const copy = async () => {
    const code = settings.data?.inviteCode
    if (!code) return

    if (await copyToClipboard(invitationText(code))) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } else {
      setCopyFailed(true)
    }
  }

  return (
    <Section title="Code d'invitation">
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography
          sx={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '2rem',
            letterSpacing: '0.15em',
            color: palette.accent,
            flex: 1,
          }}
        >
          {settings.data?.inviteCode}
        </Typography>
        <IconButton
          aria-label={copied ? 'Invitation copiée' : "Copier l'invitation"}
          onClick={copy}
          sx={{ color: copied ? palette.accent : undefined }}
        >
          {copied ? <CheckIcon /> : <ContentCopyIcon />}
        </IconButton>
        {canRegenerate && (
          <IconButton aria-label="Régénérer" onClick={() => setConfirming(true)}>
            <RefreshIcon />
          </IconButton>
        )}
      </Stack>

      {copyFailed && (
        <TextField
          label="Copie automatique impossible — sélectionne et copie à la main"
          value={settings.data ? invitationText(settings.data.inviteCode ?? '') : ''}
          multiline
          minRows={6}
          onFocus={(e) => e.target.select()}
        />
      )}

      <ConfirmDialog
        open={confirming}
        title="Régénérer le code ?"
        confirmLabel="Régénérer"
        danger
        pending={regenerate.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => regenerate.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      >
        <Typography variant="body2" color="text.secondary">
          L&apos;ancien code cessera immédiatement de fonctionner : les joueurs à qui tu l&apos;as
          déjà communiqué ne pourront plus créer leur compte. Les comptes existants ne sont pas
          affectés.
        </Typography>
      </ConfirmDialog>
    </Section>
  )
}

/** Création d'un participant, ouverte depuis le « + » de la section Membres. */
const AddParticipantDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const createMember = useCreateMember()
  const [name, setName] = useState('')

  // Repart d'un champ vide à chaque ouverture, sinon on retrouve le nom
  // précédemment saisi.
  useEffect(() => {
    if (open) setName('')
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Ajouter un participant</DialogTitle>
      <DialogContent>
        <TextField
          label="Nom affiché"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annuler</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || createMember.isPending}
          onClick={() =>
            createMember.mutate({ displayName: name.trim() }, { onSuccess: onClose })
          }
        >
          Créer
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Modification d'un participant : nom, rôle, et détachement du compte.
 *
 * Le formulaire est entièrement local — rien ne part tant qu'on n'a pas
 * enregistré, et « Annuler » n'a donc aucune conséquence. À la validation,
 * seuls les champs réellement modifiés donnent lieu à une requête.
 *
 * Le détachement fait exception : c'est une action, pas un champ. Elle a sa
 * propre confirmation et s'applique immédiatement.
 */
const MemberDialog = ({
  member,
  onClose,
}: {
  member: MemberSummary | null
  onClose: () => void
}) => {
  const me = useMe()
  const updateMember = useUpdateMember()
  const updateRole = useUpdateRole()
  const unlink = useUnlinkMember()
  const [name, setName] = useState('')
  const [role, setRole] = useState<'PLAYER' | 'MANAGER'>('PLAYER')
  const [receivesFines, setReceivesFines] = useState(true)
  const [unlinking, setUnlinking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!member) return
    setName(member.displayName)
    setRole(member.role === 'MANAGER' ? 'MANAGER' : 'PLAYER')
    setReceivesFines(member.receivesFines)
  }, [member])

  if (!member) return null

  const isSelf = member.userId === me.data?.user.id
  const linked = member.userId !== null
  // Le rôle ADMIN n'est ni transférable ni révocable, et on ne modifie pas
  // le sien : sans ça, on peut se retrouver sans administrateur.
  const canChangeRole = linked && member.role !== 'ADMIN' && !isSelf

  const nameChanged = name.trim() !== member.displayName
  const roleChanged = canChangeRole && role !== member.role
  const finesChanged = receivesFines !== member.receivesFines
  const dirty = nameChanged || roleChanged || finesChanged

  const save = async () => {
    setSaving(true)
    try {
      if (nameChanged || finesChanged) {
        await updateMember.mutateAsync({
          id: member.id,
          ...(nameChanged ? { displayName: name.trim() } : {}),
          ...(finesChanged ? { receivesFines } : {}),
        })
      }
      if (roleChanged) await updateRole.mutateAsync({ userId: member.userId!, role })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Modifier le participant</DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField label="Nom affiché" value={name} onChange={(e) => setName(e.target.value)} />

            {canChangeRole && (
              <Stack spacing={0.5}>
                <Typography variant="overline" color="text.secondary">
                  Rôle
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={role}
                  onChange={(_, v: 'PLAYER' | 'MANAGER' | null) => v && setRole(v)}
                >
                  <ToggleButton value="PLAYER">Joueur</ToggleButton>
                  <ToggleButton value="MANAGER">Gestionnaire</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            )}

            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Amendes
              </Typography>
              <FormControlLabel
                sx={{ ml: 0, justifyContent: 'space-between' }}
                labelPlacement="start"
                control={
                  <Switch
                    checked={receivesFines}
                    onChange={(e) => setReceivesFines(e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Concerné par les amendes</Typography>}
              />
            </Stack>

            {linked && (
              <Stack spacing={0.5}>
                <Typography variant="overline" color="text.secondary">
                  Compte rattaché
                </Typography>
                {!isSelf && (
                  <Button
                    variant="outlined"
                    startIcon={<LockResetIcon />}
                    onClick={() => setResetting(true)}
                  >
                    Réinitialiser le mot de passe
                  </Button>
                )}
                <Button
                  color="error"
                  variant="outlined"
                  startIcon={<LinkOffIcon />}
                  onClick={() => setUnlinking(true)}
                >
                  Détacher le compte
                </Button>
              </Stack>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="contained" disabled={!name.trim() || !dirty || saving} onClick={save}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <ResetPasswordDialog
        member={member}
        open={resetting}
        onClose={() => setResetting(false)}
      />

      <ConfirmDialog
        open={unlinking}
        title="Détacher le compte ?"
        confirmLabel="Détacher"
        danger
        pending={unlink.isPending}
        onClose={() => setUnlinking(false)}
        onConfirm={() =>
          unlink.mutate(member.id, {
            onSuccess: () => {
              setUnlinking(false)
              onClose()
            },
          })
        }
      >
        <Typography variant="body2" color="text.secondary">
          {member.displayName} redeviendra un participant sans compte, avec tout son
          historique d&apos;amendes. La personne concernée sera invitée à choisir de nouveau
          son nom à sa prochaine ouverture de l&apos;app. Ni son compte ni ses amendes ne
          sont supprimés.
        </Typography>
      </ConfirmDialog>
    </>
  )
}

/**
 * Réinitialisation en deux temps : on confirme, puis on lit le mot de passe
 * temporaire.
 *
 * Il n'apparaît qu'ici et qu'une fois — il n'est stocké que haché, aucune route
 * ne permet de le relire. D'où l'avertissement, et le bouton copier.
 */
const ResetPasswordDialog = ({
  member,
  open,
  onClose,
}: {
  member: MemberSummary
  open: boolean
  onClose: () => void
}) => {
  const resetPassword = useResetPassword()
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const close = () => {
    setPassword(null)
    setCopied(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>
        {password ? 'Mot de passe temporaire' : 'Réinitialiser le mot de passe ?'}
      </DialogTitle>

      <DialogContent>
        {password ? (
          <Stack spacing={2}>
            <Card
              sx={{
                bgcolor: 'rgba(148,163,184,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography
                sx={{
                  flex: 1,
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1.75rem',
                  letterSpacing: '0.12em',
                  color: palette.accent,
                }}
              >
                {password}
              </Typography>
              <IconButton
                aria-label={copied ? 'Copié' : 'Copier le mot de passe'}
                sx={{ color: copied ? palette.accent : undefined }}
                onClick={async () => {
                  if (await copyToClipboard(password)) {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2500)
                  }
                }}
              >
                {copied ? <CheckIcon /> : <ContentCopyIcon />}
              </IconButton>
            </Card>

            <Alert severity="warning">
              Note-le maintenant : il ne sera plus jamais affiché. Transmets-le à{' '}
              {member.displayName}, qui devra choisir un nouveau mot de passe à sa prochaine
              connexion.
            </Alert>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Un mot de passe temporaire sera généré pour {member.displayName} et affiché une
              seule fois. Son mot de passe actuel cessera immédiatement de fonctionner.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Ses appareils déjà connectés seront déconnectés, et il devra choisir un nouveau
              mot de passe avant de pouvoir utiliser l&apos;app.
            </Typography>
            {resetPassword.error && (
              <Alert severity="error">{resetPassword.error.message}</Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {password ? (
          <Button variant="contained" onClick={close}>
            J&apos;ai noté
          </Button>
        ) : (
          <>
            <Button onClick={close}>Annuler</Button>
            <Button
              variant="contained"
              disabled={resetPassword.isPending}
              onClick={() =>
                resetPassword.mutate(member.userId!, {
                  onSuccess: (r) => setPassword(r.temporaryPassword),
                })
              }
            >
              Réinitialiser
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}

const MembersSection = ({ canManage }: { canManage: boolean }) => {
  const members = useMembers()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<MemberSummary | null>(null)

  return (
    <>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1.5, minHeight: 40 }}
      >
        <SectionTitle sx={{ mb: 0 }}>Membres</SectionTitle>
        {canManage && (
          <IconButton
            size="small"
            color="primary"
            aria-label="Ajouter un participant"
            onClick={() => setAdding(true)}
          >
            <AddIcon />
          </IconButton>
        )}
      </Stack>

      <AddParticipantDialog open={adding} onClose={() => setAdding(false)} />

      <Stack spacing={1} sx={{ mb: 2 }}>
        {members.data?.map((m) => (
          <Card key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Initials name={m.displayName} size={32} />
            <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
              {m.displayName}
            </Typography>

            {/* Les pastilles ne se compriment jamais : c'est le nom qui se
                tronque, pas le statut. */}
            <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
              {/* Marquée en creux, et seulement pour l'exception : l'immense
                  majorité des participants est amendable, l'afficher partout
                  n'apprendrait rien. Contour plutôt que couleur pleine — les
                  couleurs disent l'état d'un paiement dans toute l'app, pas
                  celui d'un participant. */}
              {!m.receivesFines && (
                <Chip
                  size="small"
                  variant="outlined"
                  label="Hors amendes"
                  sx={{ borderColor: 'rgba(148,163,184,0.4)', color: palette.textMuted }}
                />
              )}

              {/* Toujours une pastille au même endroit : une ligne sans rien à
                  droite se lit comme un bug d'affichage. */}
              {m.userId === null ? (
                <Chip
                  size="small"
                  label="Pas inscrit"
                  sx={{ bgcolor: 'rgba(148,163,184,0.15)', color: palette.textMuted }}
                />
              ) : m.role === 'ADMIN' ? (
                <Chip size="small" label="Admin" color="secondary" />
              ) : (
                <Chip
                  size="small"
                  label={m.role === 'MANAGER' ? 'Gestionnaire' : 'Joueur'}
                  color={m.role === 'MANAGER' ? 'primary' : 'default'}
                />
              )}
            </Stack>

            {canManage && (
              <IconButton size="small" aria-label="Modifier" onClick={() => setEditing(m)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            )}
          </Card>
        ))}
      </Stack>

      <MemberDialog member={editing} onClose={() => setEditing(null)} />
    </>
  )
}

const LogoutSection = () => {
  const logout = useLogout()

  return (
    <Stack sx={{ mt: 3 }}>
      <Button
        color="inherit"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
        sx={{ color: palette.textMuted }}
      >
        Se déconnecter
      </Button>
      {logout.error && (
        <Typography variant="caption" sx={{ mt: 1, color: palette.danger }}>
          {logout.error.message}
        </Typography>
      )}
    </Stack>
  )
}
