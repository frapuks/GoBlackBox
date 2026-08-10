import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Container,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import { useAddFine, useMembers, useRules } from '../api/hooks'
import { Amount, Card, Initials } from '../components/ui'
import { pageSpacing, palette } from '../theme'

/**
 * L'écran le plus important de l'app : sélection tactile, zéro clavier.
 * Étape 1 un ou plusieurs joueurs, étape 2 la règle appliquée à tout le lot.
 * Pas de liste déroulante : on saisit debout, au bord du terrain.
 */
export const AddFinePage = () => {
  const navigate = useNavigate()
  const members = useMembers()
  const rules = useRules()
  const addFine = useAddFine()

  const [selected, setSelected] = useState<number[]>([])
  const [step, setStep] = useState<1 | 2>(1)

  const all = members.data ?? []
  const allSelected = all.length > 0 && selected.length === all.length

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = (ruleId: number) => {
    if (selected.length === 0) return
    addFine.mutate(
      { memberIds: selected, ruleId },
      {
        onSuccess: (fines) => {
          // Filet de sécurité plutôt qu'une confirmation avant : on valide vite,
          // et on annule tout le lot si on s'est trompé.
          navigate('/fines', {
            state: {
              undoFineIds: fines.map((f) => f.id),
              undoLabel:
                fines.length === 1
                  ? fines[0]!.label + ' · ' + fines[0]!.memberName
                  : fines[0]!.label + ' · ' + fines.length + ' joueurs',
            },
          })
        },
      },
    )
  }

  return (
    <Container
      maxWidth="sm"
      disableGutters
      sx={{
        minHeight: '100dvh',
        // Marge basse suffisante pour que la barre d'action ne masque jamais
        // la dernière ligne de la liste.
        pb: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
        ...pageSpacing,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        {step === 1 ? (
          <IconButton onClick={() => navigate(-1)} aria-label="Fermer">
            <CloseIcon />
          </IconButton>
        ) : (
          <IconButton onClick={() => setStep(1)} aria-label="Retour">
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Étape {step} sur 2
        </Typography>
      </Stack>

      <LinearProgress variant="determinate" value={step === 1 ? 50 : 100} sx={{ mb: 3 }} />

      {step === 1 && (
        <>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            QUI EST LE FAUTIF ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sélectionne un ou plusieurs joueurs.
          </Typography>

          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSelected(allSelected ? [] : all.map((m) => m.id))}
            >
              {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
            </Button>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            {all.map((m) => {
              const isSelected = selected.includes(m.id)
              return (
                <Card
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  sx={{
                    position: 'relative',
                    textAlign: 'center',
                    cursor: 'pointer',
                    py: 2.5,
                    // La sélection se voit à la bordure ET au fond : la seule
                    // bordure passe inaperçue sur un écran de téléphone au soleil.
                    border: '2px solid',
                    borderColor: isSelected ? palette.accent : 'transparent',
                    bgcolor: isSelected ? 'rgba(249,115,22,0.12)' : 'background.paper',
                  }}
                >
                  {isSelected && (
                    <CheckCircleIcon
                      sx={{ position: 'absolute', top: 8, right: 8, color: palette.accent }}
                    />
                  )}
                  <Stack alignItems="center" spacing={1}>
                    <Initials name={m.displayName} size={56} />
                    <Typography sx={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.3rem' }}>
                      {m.displayName.toUpperCase()}
                    </Typography>
                  </Stack>
                </Card>
              )
            })}
          </Box>
        </>
      )}

      {step === 2 && (
        <>
          {/* « Appliquer » plutôt qu'« enfreinte » : les cotisations
              apparaissent aussi ici, pour pouvoir rattraper un joueur arrivé
              après l'application collective. */}
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            QUELLE RÈGLE APPLIQUER ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selected.length === 1
              ? 'Le tarif sera appliqué à ' + selectedNames(all, selected) + '.'
              : 'Le tarif sera appliqué aux ' + selected.length + ' joueurs sélectionnés.'}
          </Typography>

          <Stack spacing={1}>
            {rules.data?.map((r) => (
              <Card
                key={r.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}
                onClick={() => submit(r.id)}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{ fontFamily: '"Archivo Narrow", sans-serif', fontWeight: 600 }}
                    textTransform="uppercase"
                  >
                    {r.label}
                  </Typography>
                  {r.description && (
                    <Typography variant="body2" color="text.secondary">
                      {r.description}
                    </Typography>
                  )}
                </Box>
                <Amount amount={r.amount} state="due" size="lg" />
              </Card>
            ))}

            {rules.data?.length === 0 && (
              <Card>
                <Typography variant="body2" color="text.secondary">
                  Aucune règle active. Crée-en une depuis l&apos;onglet Règles.
                </Typography>
              </Card>
            )}
          </Stack>

          {addFine.error && (
            <Typography sx={{ mt: 2, color: palette.danger }}>{addFine.error.message}</Typography>
          )}
        </>
      )}

      {/* Barre d'action fixe : le bouton reste atteignable au pouce même avec
          17 joueurs à faire défiler. */}
      {step === 1 && selected.length > 0 && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            p: 2,
            pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            bgcolor: palette.surface,
            borderTop: '1px solid rgba(148,163,184,0.15)',
          }}
        >
          <Container maxWidth="sm" disableGutters>
            <Button fullWidth size="large" variant="contained" onClick={() => setStep(2)}>
              Suivant · {selected.length} joueur{selected.length > 1 ? 's' : ''}
            </Button>
          </Container>
        </Box>
      )}
    </Container>
  )
}

const selectedNames = (all: { id: number; displayName: string }[], selected: number[]) =>
  all
    .filter((m) => selected.includes(m.id))
    .map((m) => m.displayName)
    .join(', ')
