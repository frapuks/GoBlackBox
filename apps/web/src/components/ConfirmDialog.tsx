import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'

/**
 * Confirmation générique, dans la charte de l'app.
 *
 * Remplace `window.confirm`, qui affiche une boîte système hors charte, bloque
 * le fil d'exécution et n'accepte qu'une chaîne de caractères — impossible d'y
 * montrer le détail de ce qu'on s'apprête à faire.
 */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel = 'Confirmer',
  danger = false,
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  children?: React.ReactNode
  confirmLabel?: string
  /** Action destructrice : le bouton passe en rouge. */
  danger?: boolean
  pending?: boolean
  onClose: () => void
  onConfirm: () => void
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
    <DialogTitle>{title}</DialogTitle>
    {children && <DialogContent>{children}</DialogContent>}
    <DialogActions>
      <Button onClick={onClose}>Annuler</Button>
      <Button
        variant="contained"
        color={danger ? 'error' : 'primary'}
        onClick={onConfirm}
        disabled={pending}
      >
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
)
