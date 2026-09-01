import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { fromDayKey, toDayKey } from '@blackbox/shared'
import { formatDay, formatDayRange } from './ui'
import { palette } from '../theme'

/**
 * Sélecteurs de date de la caisse — un jour seul, ou une période.
 *
 * Écrits à la main : HTML n'a pas d'input de plage, et le sélecteur de plage de
 * MUI appartient à l'offre payante. Les deux partagent le même calendrier, donc
 * ils ne peuvent pas diverger visuellement.
 *
 * Les dates circulent en « AAAA-MM-JJ », jamais en objet Date : c'est le format
 * de la base et de l'API, et il évite tout décalage de fuseau.
 */

/** Lundi en tête, comme un calendrier français. */
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const mondayIndex = (d: Date) => (d.getDay() + 6) % 7

/**
 * Six semaines, toujours. Un mois en occupe quatre à six selon sa longueur et
 * le jour où il tombe ; laisser la grille suivre ferait changer la hauteur de
 * la boîte, qui est centrée — donc les flèches de navigation se déplaceraient
 * sous le doigt d'un mois à l'autre. On complète par des cases vides.
 */
const ROWS = 6

/** Les cases du mois, précédées des vides qui alignent le 1er sur son jour. */
const monthGrid = (month: Date): (string | null)[] => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()

  const cells: (string | null)[] = [
    ...Array<null>(mondayIndex(first)).fill(null),
    ...Array.from({ length: days }, (_, i) =>
      toDayKey(new Date(month.getFullYear(), month.getMonth(), i + 1)),
    ),
  ]

  return [...cells, ...Array<null>(ROWS * 7 - cells.length).fill(null)]
}

/**
 * Le calendrier lui-même. Il ne décide de rien : il affiche la sélection qu'on
 * lui donne et signale le jour touché. Un mois à la fois — largement assez pour
 * choisir une échéance ou un week-end.
 *
 * `end` à null : un seul jour est mis en avant, ce qui couvre le mode date
 * simple sans second composant.
 */
const MonthCalendar = ({
  start,
  end,
  onPick,
}: {
  start: string | null
  end: string | null
  onPick: (day: string) => void
}) => {
  // La boîte de dialogue démonte son contenu à la fermeture : ce mois est donc
  // recalculé à chaque ouverture, à partir de la sélection courante.
  const [month, setMonth] = useState(() => {
    const anchor = start ? fromDayKey(start) : new Date()
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  })

  const shift = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))

  const today = toDayKey(new Date())

  return (
    <>
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
        <IconButton aria-label="Mois précédent" onClick={() => shift(-1)}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="overline" sx={{ flex: 1, textAlign: 'center', color: palette.text }}>
          {month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </Typography>
        <IconButton aria-label="Mois suivant" onClick={() => shift(1)}>
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
        {WEEKDAYS.map((d, i) => (
          <Typography
            key={i}
            variant="caption"
            sx={{ textAlign: 'center', color: palette.textMuted, pb: 0.5 }}
          >
            {d}
          </Typography>
        ))}

        {monthGrid(month).map((day, i) => {
          // `aspectRatio` aussi sur les cases vides : sans hauteur propre, une
          // ligne entièrement vide s'effondre à zéro et la grille reprend la
          // hauteur variable qu'on cherchait justement à figer. Le cas ne se
          // voit que sur la DERNIÈRE ligne — les cases vides du début
          // cohabitent toujours avec des jours.
          if (day === null) return <Box key={`vide-${i}`} sx={{ aspectRatio: '1' }} />

          const edge = day === start || day === end
          const inside = start !== null && end !== null && day > start && day < end

          return (
            <Box
              key={day}
              onClick={() => onPick(day)}
              sx={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 1,
                fontSize: 14,
                fontWeight: edge ? 700 : 400,
                bgcolor: edge ? palette.accent : inside ? 'rgba(249,115,22,0.18)' : 'transparent',
                color: edge ? '#0B0E11' : palette.text,
                // Le jour même reste repérable sans être sélectionné.
                outline: day === today && !edge ? `1px solid ${palette.textMuted}` : 'none',
                outlineOffset: '-1px',
              }}
            >
              {Number(day.slice(8))}
            </Box>
          )
        })}
      </Box>
    </>
  )
}

/** Champ déclencheur, commun aux deux sélecteurs : la saisie passe par le
 *  calendrier, jamais par le clavier. `readOnly` plutôt que `disabled`, qui
 *  griserait le champ et le sortirait du parcours de tabulation. */
const PickerField = ({
  label,
  value,
  onOpen,
}: {
  label: string
  value: string
  onOpen: () => void
}) => (
  <TextField
    label={label}
    value={value}
    placeholder="Aucune date"
    onClick={onOpen}
    slotProps={{
      inputLabel: { shrink: true },
      input: { readOnly: true, sx: { cursor: 'pointer' } },
    }}
  />
)

/** Trois actions identiques dans les deux boîtes : effacer, annuler, valider. */
const PickerActions = ({
  onClear,
  onCancel,
  onConfirm,
}: {
  onClear: () => void
  onCancel: () => void
  onConfirm: () => void
}) => (
  <DialogActions>
    <Button color="inherit" onClick={onClear}>
      Effacer
    </Button>
    <Box sx={{ flex: 1 }} />
    <Button onClick={onCancel}>Annuler</Button>
    <Button variant="contained" onClick={onConfirm}>
      Valider
    </Button>
  </DialogActions>
)

/** Date seule. */
export const DateField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  const start = () => {
    setDraft(value)
    setOpen(true)
  }

  return (
    <>
      <PickerField
        label={label}
        value={value ? formatDay(value) : ''}
        onOpen={start}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogContent>
          <MonthCalendar start={draft} end={null} onPick={setDraft} />

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {draft === null ? 'Choisis un jour.' : formatDay(draft)}
          </Typography>
        </DialogContent>

        <PickerActions
          onClear={() => setDraft(null)}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            onChange(draft)
            setOpen(false)
          }}
        />
      </Dialog>
    </>
  )
}

/** Période d'un ou plusieurs jours. */
export const DateRangeField = ({
  label,
  start,
  end,
  onChange,
}: {
  label: string
  start: string | null
  /** null avec un début renseigné = un seul jour. */
  end: string | null
  onChange: (start: string | null, end: string | null) => void
}) => {
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<string | null>(null)
  const [draftEnd, setDraftEnd] = useState<string | null>(null)

  // On repart de la valeur enregistrée : annuler doit vraiment tout annuler,
  // y compris une sélection laissée à moitié faite.
  const begin = () => {
    setDraftStart(start)
    setDraftEnd(end)
    setOpen(true)
  }

  /**
   * Un seul geste par jour touché :
   *  - rien en cours, ou plage complète → on repart d'un début seul ;
   *  - un début posé, jour antérieur    → il devient le nouveau début ;
   *  - un début posé, jour postérieur   → il ferme la plage.
   * Retoucher le début même jour laisse la plage à un seul jour.
   */
  const pick = (day: string) => {
    if (draftStart === null || draftEnd !== null || day < draftStart) {
      setDraftStart(day)
      setDraftEnd(null)
      return
    }
    if (day !== draftStart) setDraftEnd(day)
  }

  return (
    <>
      <PickerField
        label={label}
        value={start ? formatDayRange(start, end) : ''}
        onOpen={begin}
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogContent>
          <MonthCalendar start={draftStart} end={draftEnd} onPick={pick} />

          {/* Hauteur réservée pour deux lignes : l'invite se replie sur un
              écran étroit, la date choisie tient sur une seule, et la boîte
              sauterait à la première sélection. */}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 2, minHeight: 40 }}
          >
            {draftStart === null
              ? 'Choisis un jour, puis un second pour couvrir une période.'
              : formatDayRange(draftStart, draftEnd)}
          </Typography>
        </DialogContent>

        <PickerActions
          onClear={() => {
            setDraftStart(null)
            setDraftEnd(null)
          }}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            onChange(draftStart, draftEnd)
            setOpen(false)
          }}
        />
      </Dialog>
    </>
  )
}
