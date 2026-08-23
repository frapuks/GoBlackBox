import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Button, Chip, Divider, IconButton, Stack, TextField, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import {
  useCreateMember,
  useLogout,
  useMe,
  useMembers,
  useSettings,
  useUpdateMe,
  useUpdateRole,
  useUpdateSettings,
} from '../api/hooks'
import { Card, Initials, SectionTitle } from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
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

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton component={RouterLink} to="/" aria-label="Retour">
          <ArrowBackIcon />
        </IconButton>
        <SectionTitle sx={{ mb: 0 }}>Réglages</SectionTitle>
      </Stack>

      <ProfileSection />
      <PasswordSection />

      {isAdmin && (
        <>
          <Divider sx={{ my: 3 }}>
            <Typography variant="overline" color="text.secondary">
              Administration
            </Typography>
          </Divider>

          <InviteCodeSection />
          <AddParticipantSection />
          <MembersSection />
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

const PasswordSection = () => {
  const updateMe = useUpdateMe()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  return (
    <Section title="Mot de passe">
      <TextField
        label="Mot de passe actuel"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <TextField
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        helperText="8 caractères minimum"
      />
      <Button
        variant="contained"
        disabled={!currentPassword || !newPassword || updateMe.isPending}
        onClick={() =>
          updateMe.mutate(
            { currentPassword, newPassword },
            {
              onSuccess: () => {
                setCurrentPassword('')
                setNewPassword('')
              },
            },
          )
        }
      >
        Changer le mot de passe
      </Button>
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

const InviteCodeSection = () => {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
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
        <IconButton aria-label="Régénérer" onClick={() => setConfirming(true)}>
          <RefreshIcon />
        </IconButton>
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
        pending={updateSettings.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          updateSettings.mutate(
            { regenerateInviteCode: true },
            { onSuccess: () => setConfirming(false) },
          )
        }
      >
        <Typography variant="body2" color="text.secondary">
          L&apos;ancien code cessera immédiatement de fonctionner : les joueurs à qui tu
          l&apos;as déjà communiqué ne pourront plus créer leur compte. Les comptes
          existants ne sont pas affectés.
        </Typography>
      </ConfirmDialog>
    </Section>
  )
}

const AddParticipantSection = () => {
  const createMember = useCreateMember()
  const [newName, setNewName] = useState('')

  return (
    <Section title="Ajouter un participant">
      <Typography variant="caption" color="text.secondary">
        Un participant sans compte peut déjà recevoir des amendes. Il rattachera son
        compte plus tard avec le code d&apos;invitation.
      </Typography>
      <TextField label="Nom affiché" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <Button
        startIcon={<AddIcon />}
        variant="contained"
        disabled={!newName || createMember.isPending}
        onClick={() =>
          createMember.mutate({ displayName: newName }, { onSuccess: () => setNewName('') })
        }
      >
        Créer
      </Button>
    </Section>
  )
}

const MembersSection = () => {
  const me = useMe()
  const members = useMembers()
  const updateRole = useUpdateRole()

  return (
    <>
      <SectionTitle>Membres</SectionTitle>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {members.data?.map((m) => {
          const isSelf = m.userId === me.data?.user.id
          // Un rôle est porté par un COMPTE : un participant fantôme n'en a pas,
          // et le rôle ADMIN n'est ni transférable ni révocable en V1.
          const canToggle = m.userId !== null && m.role !== 'ADMIN' && !isSelf

          return (
            <Card key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Initials name={m.displayName} size={32} />
              <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {m.displayName}
              </Typography>

              {/* Toujours une pastille au même endroit, cliquable ou non :
                  une ligne sans rien à droite se lit comme un bug d'affichage. */}
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
                  onClick={
                    canToggle
                      ? () =>
                          updateRole.mutate({
                            userId: m.userId!,
                            role: m.role === 'MANAGER' ? 'PLAYER' : 'MANAGER',
                          })
                      : undefined
                  }
                />
              )}
            </Card>
          )
        })}
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Le rôle Admin n&apos;est ni transférable ni révocable dans cette version.
      </Typography>
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
