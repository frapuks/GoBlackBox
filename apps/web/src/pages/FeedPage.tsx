import { useState } from 'react'
import {
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FilterListIcon from '@mui/icons-material/FilterList'
import type { Fine } from '@blackbox/shared'
import {
  useConfirmFine,
  useDeleteFine,
  useFines,
  useMe,
  useMembers,
  useSetFinePaid,
} from '../api/hooks'
import {
  Amount,
  Card,
  EmptyState,
  SectionTitle,
  StatusChip,
  fineState,
  formatAgo,
} from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { palette } from '../theme'

/**
 * Le fil est le SEUL endroit où l'on coche une amende comme payée.
 * C'est pour ça que les deux filtres ne sont pas optionnels : sans eux,
 * retrouver une amende de la semaine dernière devient vite pénible.
 */
export const FeedPage = () => {
  const [unpaid, setUnpaid] = useState(false)
  const [memberId, setMemberId] = useState<number | ''>('')
  /** Amende dont la suppression attend confirmation. */
  const [deleting, setDeleting] = useState<Fine | null>(null)

  const me = useMe()
  const members = useMembers()
  const fines = useFines({ unpaid, memberId: memberId || undefined })
  const setPaid = useSetFinePaid()
  const remove = useDeleteFine()
  const confirmFine = useConfirmFine()

  const isStaff = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'MANAGER'

  /**
   * Un joueur peut retirer son propre signalement tant qu'il est en attente.
   * Une fois validé, il ne lui appartient plus.
   */
  const isMyReport = (f: Fine) =>
    f.status === 'PENDING' && f.createdById === me.data?.member?.id

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
          const pending = f.status === 'PENDING'

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
                // Liseré : rouge pour un retard, orange pour un signalement en
                // attente. La bordure transparente garde l'alignement du texte
                // identique sur toutes les lignes.
                borderLeft: `3px solid ${
                  pending ? palette.accent : f.isLate ? palette.danger : 'transparent'
                }`,
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

              {pending ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label="À valider"
                  sx={{ color: palette.accent, borderColor: palette.accent, height: 22 }}
                />
              ) : (
                <StatusChip state={fineState(paid, f.isLate)} />
              )}

              {isStaff &&
                (pending ? (
                  // Un signalement se valide ou se supprime. Le cocher payé
                  // n'aurait aucun sens tant qu'il n'est pas entériné.
                  <IconButton
                    size="small"
                    aria-label="Valider ce signalement"
                    onClick={() => confirmFine.mutate(f.id)}
                    disabled={confirmFine.isPending}
                    sx={{ color: palette.accent }}
                  >
                    <CheckCircleIcon />
                  </IconButton>
                ) : (
                  <Checkbox
                    checked={paid}
                    onChange={(e) => setPaid.mutate({ id: f.id, paid: e.target.checked })}
                    inputProps={{ 'aria-label': 'Marquer comme payée' }}
                  />
                ))}

              {(isStaff || isMyReport(f)) && (
                <IconButton
                  size="small"
                  aria-label={isStaff ? 'Supprimer' : 'Annuler mon signalement'}
                  onClick={() => setDeleting(f)}
                >
                  <DeleteOutlineIcon fontSize="small" sx={{ color: palette.textMuted }} />
                </IconButton>
              )}
            </Card>
          )
        })}
      </Stack>

      <ConfirmDialog
        open={deleting !== null}
        title={
          deleting && !isStaff ? 'Annuler ton signalement ?' : 'Supprimer cette amende ?'
        }
        confirmLabel={deleting && !isStaff ? 'Annuler le signalement' : 'Supprimer'}
        danger
        pending={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }}
      >
        {deleting && (
          <Stack spacing={0.5}>
            <Typography sx={{ fontWeight: 600 }}>{deleting.memberName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {deleting.label} · {deleting.amount} € · {formatAgo(deleting.createdAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
              {deleting.status === 'PENDING'
                ? 'Le signalement disparaîtra du fil. Personne ne sera prévenu.'
                : 'Elle disparaîtra du fil et des totaux. Cette action est définitive.'}
            </Typography>
          </Stack>
        )}
      </ConfirmDialog>
    </>
  )
}
