import {
  daysBetween,
  monthStartsBetween,
  type PotHistoryPoint,
  type PotProjection,
} from '@blackbox/shared'

/**
 * Prévision du montant de la caisse à sa date de fin.
 *
 * Le principe : ne pas estimer ce qu'on sait déjà.
 *
 *   prévision = montant actuel
 *             + cotisations restantes   ← compté, pas estimé
 *             + amendes à venir         ← estimé, au rythme des 4 dernières semaines
 *
 * Une cotisation est un escalier, pas une pente : la moyenner en euros par jour
 * transforme une donnée exacte en approximation, et surtout projette en mai des
 * cotisations qui ne tomberont plus. Sur un effectif de dix-huit à 20 €, une
 * fenêtre de six semaines en contient une ou deux — soit les deux tiers du
 * « rythme » observé, appliqués à un mois où il n'en reste aucune.
 *
 * La décomposition supprime ce biais sans aucun cas particulier : en avril il
 * reste un 1er mai, en mai il n'en reste aucun, et la fenêtre de rythme ne
 * contient plus jamais de cotisation.
 */

/**
 * Fenêtre du rythme des amendes, et surtout DÉNOMINATEUR FIXE.
 *
 * Diviser par le temps écoulé depuis la première amende est le piège : trois
 * jours après un premier carton à 90 €, la moyenne vaut 30 €/jour et projette
 * 8 100 € sur une saison. Diviser par 28 quoi qu'il arrive donne 3,2 €/jour,
 * soit ~870 € — prudent au départ, et qui monte à mesure que la fenêtre se
 * remplit vraiment.
 *
 * C'est ce qui permet de se passer de tout seuil minimal : le calcul n'est
 * plus explosif quand les données sont maigres, il est simplement bas.
 */
const RATE_WINDOW_DAYS = 28

export type ForecastInput = {
  today: string
  /** Date de fin de la caisse. Sans elle, pas d'horizon donc pas de prévision. */
  endDate: string | null
  points: PotHistoryPoint[]
  /**
   * Amendes HORS cotisations tombées sur les `RATE_WINDOW_DAYS` derniers jours.
   *
   * Hors cotisations, sans quoi elles compteraient deux fois : une fois lissées
   * dans le rythme, une fois comptées à leur date.
   *
   * Les pénalités de retard y restent : elles se comportent comme des amendes
   * ordinaires du point de vue de la prévision.
   */
  finesWindow: number
  /** Somme encaissée à chaque application : montant des cotisations × effectif concerné. */
  duesPerApplication: number
}

export const buildProjection = ({
  today,
  endDate,
  points,
  finesWindow,
  duesPerApplication,
}: ForecastInput): PotProjection | null => {
  // Seule condition : un horizon. Aucun seuil d'historique — les cotisations
  // restantes sont exactes dès le premier jour, et les bloquer parce que le
  // terme estimé n'est pas encore fiable reviendrait à jeter une donnée sûre
  // à cause d'une donnée incertaine.
  if (endDate === null || endDate <= today) return null

  const currentTotal = points.length ? points[points.length - 1]!.total : 0
  const finesPerDay = finesWindow / RATE_WINDOW_DAYS

  // Le nombre de 1ers restants, et rien de plus : le graphique relie les deux
  // extrémités par une droite, la position exacte de chaque cotisation dans
  // l'intervalle n'a donc pas à sortir d'ici.
  const duesCount = duesPerApplication > 0 ? monthStartsBetween(today, endDate).length : 0
  const dues = duesCount * duesPerApplication

  const total = Math.round(currentTotal + finesPerDay * daysBetween(today, endDate) + dues)

  // Rien à projeter : la ligne serait plate et l'étiquette répéterait le
  // montant courant.
  if (total <= currentTotal) return null

  return {
    startDay: today,
    endDay: endDate,
    total,
    dues,
    // Déduit du total plutôt que recalculé : les deux parts s'additionnent
    // alors exactement, malgré les arrondis.
    fines: total - currentTotal - dues,
  }
}

