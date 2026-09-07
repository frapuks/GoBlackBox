import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon'

/**
 * Icônes absentes du jeu MUI, dessinées à la main.
 *
 * Toutes dans une boîte de 24 × 24, comme celles de la bibliothèque, et en
 * `currentColor` — la couleur vient de qui les affiche, jamais d'ici.
 */

export const CrownIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M5 16 3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5Zm0 2h14v2H5v-2Z" />
  </SvgIcon>
)

/**
 * Chaussette : le bord côtelé, la jambe, le pied vers la gauche.
 *
 * C'est l'angle droit entre la jambe et le pied qui la fait reconnaître — une
 * forme droite passerait pour un tube ou une bouteille.
 */
export const SockIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M8.2 3h8.6v3.4H8.2V3Z" />
    <path d="M9 7.5h7v10.7a1.8 1.8 0 0 1-1.8 1.8H6.4a2.7 2.7 0 0 1 0-5.4H9V7.5Z" />
  </SvgIcon>
)

/** Maillot : deux manches, une encolure en V, un corps droit. */
export const JerseyIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M9.3 2 12 5.2 14.7 2l4.4 1.7A2 2 0 0 1 20.4 5.6V11h-3.2v10a1 1 0 0 1-1 1H7.8a1 1 0 0 1-1-1V11H3.6V5.6a2 2 0 0 1 1.3-1.9L9.3 2Z" />
  </SvgIcon>
)

/**
 * Une icône qui n'est que du texte — « -7 », « 30 », « 2min ».
 *
 * Il n'existe aucun pictogramme pour ces valeurs, et les écrire les rend
 * immédiatement lisibles. `textLength` force la largeur : sans lui, deux et
 * quatre caractères n'occuperaient pas la même place, et les icônes ne
 * s'aligneraient plus entre elles dans la grille.
 *
 * Archivo Narrow, la police étroite de l'app : elle tient plus de caractères
 * dans les 24 unités de la boîte sans être compressée par `lengthAdjust`.
 */
const textIcon = (text: string, width: number, size: number) => {
  const Icon = (props: SvgIconProps) => (
    <SvgIcon {...props}>
      <text
        x="12"
        y={12 + size / 2.9}
        textAnchor="middle"
        textLength={width}
        lengthAdjust="spacingAndGlyphs"
        fontSize={size}
        fontWeight="700"
        fontFamily='"Archivo Narrow", sans-serif'
        fill="currentColor"
      >
        {text}
      </text>
    </SvgIcon>
  )
  Icon.displayName = `TextIcon(${text})`
  return Icon
}

export const MinusSevenIcon = textIcon('-7', 15, 15)
export const ThirtyIcon = textIcon('30', 16, 15)
/** Suspension de deux minutes. Quatre caractères : plus petits, et plus larges. */
export const TwoMinutesIcon = textIcon('2min', 22, 12)
/** Greatest Of All Time. Quatre lettres capitales : encore un peu plus petites. */
export const GoatTextIcon = textIcon('GOAT', 22, 11)
