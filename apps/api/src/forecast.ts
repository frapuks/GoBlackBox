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
 *             + amendes à venir         ← estimé, au rythme depuis le début
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
 * En deçà, pas de projection : quinze jours de données extrapolées sur une
 * saison produisent un nombre énorme et arbitraire, que quelqu'un citera.
 * On compte les jours ACTIFS et non les amendes — c'est la régularité d'usage
 * qui rend une moyenne défendable, pas le volume d'un soir de carton rouge.
 */
const MIN_SPAN_DAYS = 21
const MIN_ACTIVE_DAYS = 5

export type ForecastInput = {
  today: string
  /** Date de fin de la caisse. Sans elle, pas d'horizon donc pas de prévision. */
  endDate: string | null
  points: PotHistoryPoint[]
  /**
   * Cumul des amendes HORS cotisations. C'est la seule base du terme estimé :
   * y laisser les cotisations reviendrait à les compter deux fois, une fois
   * lissées dans le rythme et une fois comptées à leur date.
   *
   * Les pénalités de retard y restent : elles se comportent comme des amendes
   * ordinaires du point de vue de la prévision.
   */
  finesTotal: number
  /** Somme encaissée à chaque application : montant des cotisations × effectif concerné. */
  duesPerApplication: number
}

export const buildProjection = ({
  today,
  endDate,
  points,
  finesTotal,
  duesPerApplication,
}: ForecastInput): PotProjection | null => {
  if (endDate === null || endDate <= today || points.length < MIN_ACTIVE_DAYS) return null

  const firstDay = points[0]!.day
  const spanDays = daysBetween(firstDay, today)
  if (spanDays < MIN_SPAN_DAYS) return null

  const currentTotal = points[points.length - 1]!.total

  // Rythme depuis le début, et non sur une fenêtre glissante : débarrassé des
  // cotisations, il ne reste que les amendes de match, un signal bien plus
  // maigre. Six semaines prises pendant les fêtes liraient presque zéro et
  // sous-estimeraient tout le printemps. La réactivité utile est désormais
  // portée par le terme exact.
  const finesPerDay = finesTotal / spanDays

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

