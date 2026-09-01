import EuroIcon from '@mui/icons-material/Euro'
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon'
import type { MemberSummary } from '@blackbox/shared'
import { palette } from '../theme'

/**
 * Distinctions affichées derrière le nom d'un participant.
 *
 * Un seul endroit décide QUI en reçoit — `memberBadges` — et un seul décide à
 * quoi elles ressemblent — `BADGES`. Ajouter « une flamme à celui qui paie
 * toujours en retard » se fait donc en touchant ces deux tables, sans repasser
 * sur les écrans qui affichent des noms.
 *
 * Calculé côté front : ces règles sont de la présentation, et les écrans
 * concernés chargent déjà la liste des membres.
 */

/** MUI n'a pas de couronne dans son jeu d'icônes : on la dessine. */
const CrownIcon = (props: SvgIconProps) => (
  <SvgIcon {...props}>
    <path d="M5 16 3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5Zm0 2h14v2H5v-2Z" />
  </SvgIcon>
)

export type BadgeId = 'euro' | 'crown'

type BadgeDef = {
  icon: React.ComponentType<SvgIconProps>
  label: string
  color: string
}

export const BADGES: Record<BadgeId, BadgeDef> = {
  // Couleur d'accent, pas une couleur d'état : dans cette app le jaune, le
  // rouge et le gris disent où en est un PAIEMENT. Une distinction n'en a pas.
  euro: { icon: EuroIcon, label: 'Podium des amendes', color: palette.accent },
  // L'exception assumée : une couronne se lit dorée, et rien d'autre dans la
  // palette ne le dit. Elle ne voisine jamais un montant du même jaune, les
  // deux distinctions étant aux extrémités opposées du classement.
  crown: { icon: CrownIcon, label: "Le plus sage de l'équipe", color: palette.accentSoft },
}

const total = (m: MemberSummary) => m.totalOwed + m.totalPaid

/**
 * Les participants qui figurent au classement, dans l'ordre.
 *
 * Filtre ET tri sont ici, pas dans l'écran : le classement et les badges
 * doivent désigner le même premier, quelle que soit la liste dont ils partent —
 * `/dashboard` la trie par total, `/members` par nom.
 *
 * Départage à égalité par le nom, comme le fait le serveur : les distinctions
 * tombent ainsi exactement sur les lignes visibles du classement.
 */
export const rankedMembers = (members: MemberSummary[]): MemberSummary[] =>
  members
    .filter((m) => m.receivesFines || m.hasFines)
    .sort((a, b) => total(b) - total(a) || a.displayName.localeCompare(b.displayName))

/** Trois pièces au premier, deux au deuxième, une au troisième. */
const PODIUM: BadgeId[][] = [['euro', 'euro', 'euro'], ['euro', 'euro'], ['euro']]

/**
 * En deçà, pas de couronne : à trois participants le dernier est aussi sur le
 * podium, et il porterait les deux distinctions à la fois.
 */
const MIN_FOR_CROWN = 4

/** Identifiant de participant → ses distinctions. */
export const memberBadges = (members: MemberSummary[]): Map<number, BadgeId[]> => {
  const byMember = new Map<number, BadgeId[]>()
  const ranked = rankedMembers(members)

  ranked
    .slice(0, PODIUM.length)
    // Un total nul ne vaut pas un podium : en début de saison tout le monde est
    // à zéro, et les trois premiers ne seraient qu'un ordre alphabétique.
    .filter((m) => total(m) > 0)
    .forEach((m, i) => byMember.set(m.id, PODIUM[i]!))

  // La couronne au dernier — celui qui s'est le moins fait prendre.
  //
  // Seulement s'il y a un ÉCART avec le premier : sans ça, une équipe où
  // personne n'a encore d'amende couronnerait le dernier de l'alphabet.
  const last = ranked[ranked.length - 1]
  if (last && ranked.length >= MIN_FOR_CROWN && total(last) < total(ranked[0]!)) {
    byMember.set(last.id, ['crown'])
  }

  return byMember
}
