import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Button, Chip, Divider, IconButton, Stack, TextField, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import AddIcon from '@mui/icons-material/Add'
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

const InviteCodeSection = () => {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()

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
          aria-label="Régénérer"
          onClick={() => {
            const ok = confirm(
              'Régénérer le code ? L’ancien ne fonctionnera plus pour les nouvelles inscriptions.',
            )
            if (ok) updateSettings.mutate({ regenerateInviteCode: true })
          }}
        >
          <RefreshIcon />
        </IconButton>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        À communiquer aux joueurs pour qu&apos;ils puissent créer leur compte.
      </Typography>
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
