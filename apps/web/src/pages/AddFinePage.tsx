import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, IconButton, LinearProgress, Stack, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CloseIcon from '@mui/icons-material/Close'
import SportsHandballIcon from '@mui/icons-material/SportsHandball'
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import { RULE_CONTEXTS, RULE_CONTEXT_LABEL, type RuleContext } from '@blackbox/shared'
import { useAddFine, useMembers, useRules } from '../api/hooks'
import { Card, Initials } from '../components/ui'
import { NAV_HEIGHT } from '../components/AppLayout'
import { RuleCard } from '../components/RuleCard'
import { palette } from '../theme'

const CONTEXT_ICON: Record<RuleContext, React.ReactNode> = {
  MATCH: <SportsHandballIcon sx={{ fontSize: 40 }} />,
  TRAINING: <FitnessCenterIcon sx={{ fontSize: 40 }} />,
  OTHER: <MoreHorizIcon sx={{ fontSize: 40 }} />,
}

/**
 * L'écran le plus important de l'app : sélection tactile, zéro clavier.
 *   1. un ou plusieurs joueurs
 *   2. le contexte — il détermine les règles proposées
 *   3. la règle, appliquée à tout le lot
 * Pas de liste déroulante : on saisit debout, au bord du terrain.
 */
export const AddFinePage = () => {
  const navigate = useNavigate()
  const members = useMembers()
  const rules = useRules()
  const addFine = useAddFine()

  const [selected, setSelected] = useState<number[]>([])
  const [context, setContext] = useState<RuleContext | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const all = members.data ?? []
  const allSelected = all.length > 0 && selected.length === all.length

  // Seules les règles du contexte choisi sont proposées : c'est tout l'intérêt
  // de l'étape 2, la liste est divisée d'autant.
  const contextRules = rules.data?.filter((r) => r.context === context) ?? []

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const back = () => {
    if (step === 1) navigate(-1)
    else setStep((s) => (s === 3 ? 2 : 1))
  }

  const submit = (ruleId: number, tierId?: number) => {
    if (selected.length === 0) return
    addFine.mutate(
      { memberIds: selected, ruleId, tierId },
      // Une erreur de saisie se corrige depuis le fil, où chaque amende porte
      // son bouton de suppression.
      { onSuccess: () => navigate('/fines') },
    )
  }

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={back} aria-label={step === 1 ? 'Fermer' : 'Retour'}>
          {step === 1 ? <CloseIcon /> : <ArrowBackIcon />}
        </IconButton>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          Étape {step} sur 3
        </Typography>
      </Stack>

      <LinearProgress variant="determinate" value={(step / 3) * 100} sx={{ mb: 3 }} />

      {/* ------------------------------------------------ 1 · les joueurs */}
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

      {/* ----------------------------------------------- 2 · le contexte */}
      {step === 2 && (
        <>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            ON EST OÙ ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Le contexte détermine les règles proposées.
          </Typography>

          <Stack spacing={1.5}>
            {RULE_CONTEXTS.map((c) => {
              const count = rules.data?.filter((r) => r.context === c).length ?? 0
              return (
                <Card
                  key={c}
                  onClick={() => {
                    setContext(c)
                    setStep(3)
                  }}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', py: 3 }}
                >
                  <Box sx={{ color: palette.accent, display: 'flex' }}>{CONTEXT_ICON[c]}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.5rem' }}>
                      {RULE_CONTEXT_LABEL[c].toUpperCase()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {count} règle{count > 1 ? 's' : ''}
                    </Typography>
                  </Box>
                </Card>
              )
            })}
          </Stack>
        </>
      )}

      {/* -------------------------------------------------- 3 · la règle */}
      {step === 3 && (
        <>
          <Typography variant="h2" sx={{ mb: 0.5 }}>
            QUELLE RÈGLE APPLIQUER ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selected.length === 1
              ? 'Le tarif sera appliqué à ' + selectedNames(all, selected) + '.'
              : 'Le tarif sera appliqué aux ' + selected.length + ' joueurs sélectionnés.'}
          </Typography>

          <Stack spacing={1}>
            {contextRules.map((r) => (
              <RuleCard key={r.id} rule={r} onSelect={submit} />
            ))}

            {contextRules.length === 0 && (
              <Card>
                <Typography variant="body2" color="text.secondary">
                  Aucune règle dans « {context ? RULE_CONTEXT_LABEL[context] : ''} ». Crée-en une
                  depuis l&apos;onglet Règles, ou reviens en arrière pour changer de contexte.
                </Typography>
              </Card>
            )}
          </Stack>

          {addFine.error && (
            <Typography sx={{ mt: 2, color: palette.danger }}>{addFine.error.message}</Typography>
          )}
        </>
      )}

      {/* Barre d'action fixe, posée juste au-dessus de la barre de navigation :
          le bouton reste atteignable au pouce même avec 17 joueurs à faire
          défiler. Le réservoir en dessous empêche qu'elle masque la dernière
          ligne de la grille. */}
      {step === 1 && selected.length > 0 && (
        <>
          <Box sx={{ height: 88 }} />
          <Box
            sx={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: NAV_HEIGHT,
              p: 2,
              bgcolor: palette.surface,
              borderTop: '1px solid rgba(148,163,184,0.15)',
              zIndex: (t) => t.zIndex.appBar,
            }}
          >
            <Button
              fullWidth
              size="large"
              variant="contained"
              onClick={() => setStep(2)}
              sx={{ maxWidth: 600, mx: 'auto', display: 'flex' }}
            >
              Suivant · {selected.length} joueur{selected.length > 1 ? 's' : ''}
            </Button>
          </Box>
        </>
      )}
    </>
  )
}

const selectedNames = (all: { id: number; displayName: string }[], selected: number[]) =>
  all
    .filter((m) => selected.includes(m.id))
    .map((m) => m.displayName)
    .join(', ')
