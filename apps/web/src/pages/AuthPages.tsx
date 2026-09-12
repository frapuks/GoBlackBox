import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import {
  useClaim,
  useClaimable,
  useLogin,
  useSignup,
  useSignupContext,
  useUpdateMe,
} from '../api/hooks'
import { Card, ProfileAvatar, SectionTitle } from '../components/ui'
import { palette } from '../theme'

const Shell = ({ children }: { children: React.ReactNode }) => (
  <Box
    sx={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      p: 2,
      pt: 'calc(env(safe-area-inset-top, 0px) + 16px)',
      pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
    }}
  >
    <Card sx={{ width: '100%', maxWidth: 420, p: 3 }}>
      <Stack alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h1" sx={{ color: palette.text }}>
          BLACKBOX
        </Typography>
        <Typography variant="overline" color="text.secondary">
          Caisse d&apos;équipe
        </Typography>
      </Stack>
      {children}
    </Card>
  </Box>
)

export const LoginPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()

  return (
    <Shell>
      <Stack
        component="form"
        spacing={2}
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate({ email, password })
        }}
      >
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <TextField
          label="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {login.error && <Alert severity="error">{login.error.message}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={login.isPending}>
          Se connecter
        </Button>
        <Typography variant="body2" align="center" color="text.secondary">
          Nouveau dans les vestiaires ?{' '}
          <Link component={RouterLink} to="/signup">
            S&apos;inscrire
          </Link>
        </Typography>
      </Stack>
    </Shell>
  )
}

export const SignupPage = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const context = useSignupContext()
  const signup = useSignup()

  // Le tout premier compte devient ADMIN et n'a besoin d'aucun code :
  // il n'y a encore personne pour en distribuer un.
  const firstAccount = context.data?.firstAccount ?? false

  return (
    <Shell>
      <Stack
        component="form"
        spacing={2}
        onSubmit={(e) => {
          e.preventDefault()
          signup.mutate({ email, password, inviteCode: firstAccount ? undefined : inviteCode })
        }}
      >
        {firstAccount && (
          <Alert severity="info">
            Aucun compte n&apos;existe : tu seras l&apos;administrateur de la caisse.
          </Alert>
        )}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <TextField
          label="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          helperText="8 caractères minimum"
          required
        />
        {!firstAccount && (
          <TextField
            label="Code d'invitation"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            required
          />
        )}
        {signup.error && <Alert severity="error">{signup.error.message}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={signup.isPending}>
          Créer mon compte
        </Button>
        <Typography variant="body2" align="center" color="text.secondary">
          Déjà un compte ?{' '}
          <Link component={RouterLink} to="/login">
            Se connecter
          </Link>
        </Typography>
      </Stack>
    </Shell>
  )
}

/**
 * Étape 2 de l'inscription : rattacher le compte à un membre.
 * Soit on réclame un participant fantôme créé par un gestionnaire, soit on
 * se crée soi-même.
 */
export const ClaimPage = () => {
  const claimable = useClaimable()
  const claim = useClaim()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [creating, setCreating] = useState(false)

  const done = () => navigate('/')

  return (
    <Shell>
      <SectionTitle>Qui es-tu ?</SectionTitle>

      {!creating && (
        <Stack spacing={1}>
          {claimable.data?.map((m) => (
            <Button
              key={m.id}
              onClick={() => claim.mutate({ memberId: m.id }, { onSuccess: done })}
              sx={{
                justifyContent: 'flex-start',
                p: 1.5,
                bgcolor: '#22262C',
                color: palette.text,
              }}
            >
              <ProfileAvatar name={m.displayName} size={32} />
              <Typography sx={{ fontWeight: 600, ml: 1.5 }}>{m.displayName}</Typography>
            </Button>
          ))}

          {claimable.data?.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Aucun nom en attente. Crée le tien.
            </Typography>
          )}

          <Button onClick={() => setCreating(true)} sx={{ mt: 1 }}>
            Je ne suis pas dans la liste
          </Button>
        </Stack>
      )}

      {creating && (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(e) => {
            e.preventDefault()
            claim.mutate({ displayName }, { onSuccess: done })
          }}
        >
          <TextField
            label="Nom affiché"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
          />
          <Button type="submit" variant="contained" disabled={claim.isPending}>
            Valider
          </Button>
          <Button onClick={() => setCreating(false)}>Retour à la liste</Button>
        </Stack>
      )}

      {claim.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {claim.error.message}
        </Alert>
      )}
    </Shell>
  )
}

/**
 * Changement forcé après une réinitialisation par l'admin.
 *
 * Écran de la même famille que la connexion — hors de l'app, sans barre de
 * navigation : tant que le mot de passe temporaire est en place, il n'y a rien
 * d'autre à faire. La garde de routage y ramène toute autre adresse.
 */
export const ForcedPasswordPage = () => {
  const navigate = useNavigate()
  const updateMe = useUpdateMe()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const mismatch = confirmation.length > 0 && confirmation !== newPassword
  const valid =
    currentPassword.length > 0 && newPassword.length >= 8 && confirmation === newPassword

  return (
    <Shell>
      <Stack
        component="form"
        spacing={1}
        onSubmit={(e) => {
          e.preventDefault()
          updateMe.mutate(
            { currentPassword, newPassword },
            // Le drapeau retombe côté serveur ; la garde laisse alors passer.
            { onSuccess: () => navigate('/', { replace: true }) },
          )
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Ton mot de passe a été réinitialisé. Choisis-en un nouveau pour continuer.
        </Typography>

        <TextField
          label="Mot de passe temporaire"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          helperText=" "
          required
        />
        <TextField
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={tooShort}
          helperText={tooShort ? '8 caractères minimum' : ' '}
          required
        />
        <TextField
          label="Confirmer le nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={mismatch}
          helperText={mismatch ? 'Les deux mots de passe ne correspondent pas' : ' '}
          required
        />
        <Button type="submit" variant="contained" disabled={!valid || updateMe.isPending}>
          Valider
        </Button>
      </Stack>

      {updateMe.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {updateMe.error.message}
        </Alert>
      )}
    </Shell>
  )
}
