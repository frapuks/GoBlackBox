import { useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import BlockIcon from '@mui/icons-material/Block'
import {
  BADGE_IMAGES,
  type BadgeImage,
  type BadgeSource,
  type MemberBadge,
} from '@blackbox/shared'
import { palette } from '../theme'

/**
 * L'affichage des badges. QUI les porte se décide côté serveur — les comptages
 * par règle et par joueur n'existent dans aucune charge utile du front.
 *
 * Un badge est une IMAGE, et rien d'autre. Les pictogrammes qui se glissaient à
 * côté du prénom ont disparu : deux vocabulaires pour la même distinction
 * faisaient dire la chose deux fois, la seconde en moins lisible.
 */

/** L'adresse d'une image de badge, servie depuis `public/` et non du bundle. */
export const badgeImageSrc = (image: BadgeImage) => '/badges/' + BADGE_IMAGES[image].file

/**
 * « 3 amendes / 45 € » — ce que vaut la distinction, sous son libellé.
 *
 * Séparé du libellé : sur la fiche du joueur les deux s'empilent sous l'image,
 * et le chiffre se lit alors plus discrètement que la phrase.
 */
export const badgeDetail = (b: MemberBadge) =>
  // Singulier jusqu'à 1 inclus, zéro compris — « 0 amende », comme le veut
  // l'usage français. Le cas se produit sur le badge du dernier au classement.
  `${b.count} amende${b.count > 1 ? 's' : ''} / ${b.amount} €`

/**
 * L'ordre dans lequel les distinctions se disputent l'avatar : les trois du
 * système d'abord, les badges de règle en dernier.
 */
const PRIORITY: BadgeSource[] = ['FIRST', 'LAST', 'FIRST_FINE', 'RULE']

/**
 * Le badge à montrer pour un joueur, ou rien s'il n'en porte aucun.
 *
 * Un seul s'affiche même quand le joueur en cumule plusieurs : à quarante
 * pixels, deux images côte à côte ne seraient lisibles ni l'une ni l'autre.
 */
export const profileBadge = (badges: MemberBadge[]) => {
  for (const source of PRIORITY) {
    const badge = badges.find((b) => b.source === source)
    if (badge) return { src: badgeImageSrc(badge.icon), label: badge.label }
  }
  return null
}

/**
 * Un badge tel qu'il se montre hors de l'avatar : la liste de la fiche joueur,
 * les réglages, le sélecteur.
 *
 * Rond, comme dans l'avatar : les images sont carrées à la source, et un carré
 * ici ferait croire à deux badges différents.
 */
export const BadgeMark = ({
  art,
  size = 24,
}: {
  art: BadgeImage
  /** Une largeur CSS : un nombre de pixels, ou « 100% » dans une grille. */
  size?: number | string
}) => (
  <Box
    component="img"
    src={badgeImageSrc(art)}
    alt={BADGE_IMAGES[art].label}
    sx={{ width: size, height: size, borderRadius: '50%', display: 'block', flexShrink: 0 }}
  />
)

/**
 * Choix du badge d'une règle ou d'une distinction.
 *
 * Une grille plutôt qu'une liste déroulante : on choisit une image à l'œil, pas
 * par son nom. Quatre par rangée et non six — ce sont des dessins détaillés,
 * et une vignette trop petite ne se distinguerait pas de sa voisine.
 *
 * `null` est une option à part entière : une règle peut ne décerner aucun
 * badge, et l'admin peut vouloir éteindre une distinction du système.
 */
export const BadgePicker = ({
  label,
  value,
  onChange,
}: {
  /** Omis quand le titre d'une boîte de dialogue le dit déjà. */
  label?: string
  value: BadgeImage | null
  onChange: (image: BadgeImage | null) => void
}) => (
  <Stack spacing={0.5}>
    {label && (
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
    )}

    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
      <IconButton
        aria-label="Aucun badge"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        sx={{
          aspectRatio: '1',
          border: '1px solid',
          borderColor: value === null ? palette.accent : 'rgba(148,163,184,0.25)',
          color: value === null ? palette.accent : palette.textMuted,
          borderRadius: 1,
        }}
      >
        <BlockIcon />
      </IconButton>

      {(Object.keys(BADGE_IMAGES) as BadgeImage[]).map((image) => {
        const active = value === image
        return (
          <IconButton
            key={image}
            aria-label={BADGE_IMAGES[image].label}
            aria-pressed={active}
            onClick={() => onChange(image)}
            sx={{
              aspectRatio: '1',
              p: 0.5,
              border: '2px solid',
              borderColor: active ? palette.accent : 'transparent',
              borderRadius: 1,
            }}
          >
            {/* En pourcentage et non en pixels : la vignette suit la largeur
                de la colonne, donc la grille reste carrée sur tous les
                téléphones. */}
            <BadgeMark art={image} size="100%" />
          </IconButton>
        )
      })}
    </Box>
  </Stack>
)

/**
 * Le badge d'une règle, dans un formulaire : on voit celui qui est en place, et
 * le toucher ouvre la grille pour en changer.
 *
 * La grille complète prenait la moitié du formulaire pour un réglage qu'on
 * touche une fois. Ici elle ne s'ouvre que si on la demande.
 *
 * Choisir referme aussitôt : la grille n'a qu'une seule chose à faire, et rien
 * n'est enregistré tant que le formulaire lui-même n'est pas validé.
 */
export const BadgeField = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: BadgeImage | null
  onChange: (image: BadgeImage | null) => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      {/* En blanc, comme les libellés d'interrupteur : c'est une commande, pas un
          titre de section. */}
      <Typography variant="body2" sx={{ flex: 1 }}>
        {label}
      </Typography>

      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={'Choisir le badge — ' + label}
        sx={{ gap: 1, p: 0.5, borderRadius: 1 }}
      >
        {/* Le visuel seul. Son nom n'apprend rien de plus qu'une image de
            quarante-quatre pixels, et la grille le redonne au moment du choix. */}
        {value ? (
          <BadgeMark art={value} size={44} />
        ) : (
          <BlockIcon sx={{ width: 44, height: 44, color: palette.textMuted }} />
        )}
      </ButtonBase>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <BadgePicker
              value={value}
              onChange={(next) => {
                onChange(next)
                setOpen(false)
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
