import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FilterListIcon from '@mui/icons-material/FilterList'
import { useDeleteFine, useFines, useMe, useMembers, useSetFinePaid } from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  SectionTitle,
  StatusChip,
  fineState,
  formatAgo,
} from '../components/ui'
import { palette } from '../theme'

/**
 * Le fil est le SEUL endroit où l'on coche une amende comme payée.
 * C'est pour ça que les deux filtres ne sont pas optionnels : sans eux,
 * retrouver une amende de la semaine dernière devient vite pénible.
 */
export const FeedPage = () => {
  const [unpaid, setUnpaid] = useState(false)
  const [memberId, setMemberId] = useState<number | ''>('')

  // L'écran d'ajout redirige ici en passant l'amende créée : on propose
  // « Annuler » pendant 10 s plutôt qu'une pop-up de confirmation avant.
  const location = useLocation()
  const navigate = useNavigate()
  const undo = (location.state ?? null) as { undoFineIds: number[]; undoLabel: string } | null

  useEffect(() => {
    // Purge l'état de navigation, sinon le snackbar revient à chaque retour
    // arrière du navigateur sur cette page.
    if (undo) navigate('.', { replace: true, state: null })
  }, [undo, navigate])

  const [undoInfo, setUndoInfo] = useState(undo)
  useEffect(() => {
    if (undo) setUndoInfo(undo)
  }, [undo])

  const me = useMe()
  const members = useMembers()
  const fines = useFines({ unpaid, memberId: memberId || undefined })
  const setPaid = useSetFinePaid()
  const remove = useDeleteFine()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'

  return (
    <>
      <SectionTitle>Fil d&apos;activité</SectionTitle>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        <Chip
          icon={<FilterListIcon />}
          label="Impayées"
          onClick={() => setUnpaid((v) => !v)}
          color={unpaid ? 'primary' : 'default'}
          variant={unpaid ? 'filled' : 'outlined'}
        />
        <Select
          size="small"
          displayEmpty
          value={memberId}
          onChange={(e) => setMemberId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ flex: 1 }}
        >
          <MenuItem value="">Tous les joueurs</MenuItem>
          {members.data?.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              {m.displayName}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {fines.isPending && <CircularProgress />}
      {fines.data?.length === 0 && <EmptyState>Aucune amende</EmptyState>}

      <Stack spacing={1}>
        {fines.data?.map((f) => {
          const paid = f.paidAt !== null

          return (
            <Card
              key={f.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1.5,
                // Une amende payée s'estompe entièrement, exactement comme sur
                // la fiche membre : c'est de l'archive, pas de l'actionnable.
                opacity: paid ? 0.5 : 1,
                // Liseré rouge repérable au défilement, comme sur la fiche
                // membre. La bordure transparente garde l'alignement du texte
                // identique sur toutes les lignes.
                borderLeft: f.isLate ? '3px solid ' + palette.danger : '3px solid transparent',
              }}
            >
              <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography
                    sx={{ fontWeight: 600, textDecoration: paid ? 'line-through' : 'none' }}
                    noWrap
                  >
                    {f.memberName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {formatAgo(f.createdAt)}
                  </Typography>
                </Stack>
                <Typography variant="body2" sx={{ textDecoration: paid ? 'line-through' : 'none' }}>
                  {f.label}
                </Typography>
              </Stack>

              <Amount amount={f.amount} state={fineState(paid, f.isLate)} />

              <StatusChip state={fineState(paid, f.isLate)} />

              {isStaff && (
                <>
                  <Checkbox
                    checked={paid}
                    onChange={(e) => setPaid.mutate({ id: f.id, paid: e.target.checked })}
                    inputProps={{ 'aria-label': 'Marquer comme payée' }}
                  />
                  <IconButton
                    size="small"
                    aria-label="Supprimer"
                    onClick={() => {
                      const ok = confirm('Supprimer cette amende de ' + f.memberName + ' ?')
                      if (ok) remove.mutate(f.id)
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" sx={{ color: palette.textMuted }} />
                  </IconButton>
                </>
              )}
            </Card>
          )
        })}
      </Stack>

      <Snackbar
        open={undoInfo !== null}
        autoHideDuration={10_000}
        onClose={() => setUndoInfo(null)}
        message={undoInfo ? 'Amende ajoutée · ' + undoInfo.undoLabel : ''}
        action={
          <Button
            color="primary"
            onClick={() => {
              // Le lot entier est annulé, pas seulement la dernière amende.
              undoInfo?.undoFineIds.forEach((id) => remove.mutate(id))
              setUndoInfo(null)
            }}
          >
            Annuler
          </Button>
        }
      />
    </>
  )
}
