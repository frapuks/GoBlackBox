import {
  rankedMembers,
  type BadgeImage,
  type MemberBadge,
  type RuleContext,
} from '@blackbox/shared'
import { query, queryOne } from './db.js'

/**
 * Distinctions portées à côté d'un prénom.
 *
 * Deux origines, un seul type en sortie :
 *
 *  - **le champion d'une règle** — celui qui a reçu le plus d'amendes de ce
 *    type porte l'icône choisie par le gestionnaire à la création de la règle ;
 *  - **le classement** — un euro au premier de la cagnotte, une couronne au
 *    dernier.
 *
 * Rien n'est stocké : tout se recalcule à la lecture. Supprimer une amende
 * rend donc le badge à son ancien porteur, sans aucun recalcul à déclencher.
 *
 * Ici et non côté front : les comptages par règle et par joueur n'existent dans
 * aucune charge utile, et les reconstituer demanderait de charger toutes les
 * amendes de l'équipe sur chaque écran affichant un prénom.
 */

type ChampionRow = {
  member_id: number
  icon: BadgeImage
  rule_label: string
  rule_context: RuleContext
  fines: number
  euros: number
}

/**
 * Le champion de chaque règle qui décerne un badge.
 *
 * Départage, dans l'ordre :
 *  1. le plus d'amendes de cette règle ;
 *  2. le plus gros montant cumulé de cette règle ;
 *  3. le MOINS d'amendes au total, cotisations exclues ;
 *  4. la première amende de cette règle la plus ancienne ;
 *  5. l'amende enregistrée la première, pour les lots de même date.
 * Cinq critères pour qu'il n'y ait jamais deux porteurs, ni de badge non
 * attribué.
 *
 * Toutes les règles sont concernées, cotisations et pénalités de retard
 * comprises : la pénalité désigne le plus mauvais payeur, ce qui a du sens.
 * Une cotisation, elle, tombe sur toute l'équipe le même jour, donc son
 * champion sera le plus ancien de l'effectif — c'est au gestionnaire de juger
 * si la distinction l'amuse, pas au code de la lui interdire.
 *
 * `DISTINCT ON` retient la première ligne de chaque règle une fois l'ordre posé :
 * c'est exactement « l'argmax », sans sous-requête.
 */
const championsSql = (cutoff: boolean) => `
  SELECT DISTINCT ON (f.rule_id)
         f.member_id,
         r.badge_icon                AS icon,
         r.label                     AS rule_label,
         r.context                   AS rule_context,
         COUNT(*)::int               AS fines,
         SUM(f.amount)::int          AS euros
    FROM fines f
    JOIN rules r ON r.id = f.rule_id
    -- Le nombre total d'amendes de chaque joueur, pour le troisième critère.
    -- Cotisations exclues, comme partout où l'on parle d'amendes : elles
    -- tombent sur tout le monde et ne disent rien du comportement.
    LEFT JOIN (
      SELECT g.member_id, COUNT(*)::int AS all_fines
        FROM fines g
        LEFT JOIN rules gr ON gr.id = g.rule_id
       WHERE g.status = 'CONFIRMED'
         AND (gr.kind IS NULL OR gr.kind <> 'DUES')
         ${cutoff ? 'AND g.created_at < $1' : ''}
       GROUP BY g.member_id
    ) totals ON totals.member_id = f.member_id
   WHERE f.status = 'CONFIRMED'
     AND r.badge_icon IS NOT NULL
     -- Une règle archivée ne décerne plus rien : elle ne se donne plus, donc
     -- son champion est figé et le badge n'a plus de sens.
     --
     -- Filtré ici plutôt qu'en effaçant l'icône à l'archivage : rien dans ce
     -- système n'est stocké, et l'archivage se défait. Désarchiver rend donc le
     -- badge, au lieu d'obliger à rechoisir l'icône.
     AND r.archived_at IS NULL
     ${cutoff ? 'AND f.created_at < $1' : ''}
   GROUP BY f.rule_id, f.member_id, r.badge_icon, r.label, r.context, totals.all_fines
   ORDER BY f.rule_id,
            COUNT(*) DESC,
            SUM(f.amount) DESC,
            -- À égalité sur la règle, le joueur qui a le MOINS d'amendes au total :
            -- cette règle pèse plus lourd dans son comportement. Effet voulu, les
            -- badges se répartissent sur davantage de joueurs — un joueur peut
            -- toujours tous les cumuler, mais seulement en étant majoritaire
            -- strict sur chacun.
            totals.all_fines ASC,
            MIN(f.created_at) ASC,
            -- Dernier recours, et il est indispensable : des amendes saisies en
            -- lot portent la MÊME date à la microseconde, NOW() étant figé pour
            -- toute la transaction. Sans ce critère, deux joueurs à égalité
            -- parfaite se disputaient le badge au hasard d'une lecture à
            -- l'autre — et le résumé de la semaine y voyait un changement de
            -- porteur qui n'avait jamais eu lieu.
            MIN(f.id) ASC
`

/**
 * Où l'amende se compte, ajouté au libellé du badge.
 *
 * « Autres » ne dit rien : un badge « Le plus de Anniversaire en autres » serait
 * du bruit, alors que « en match » ou « à l'entraînement » distingue deux règles
 * qui portent souvent le même nom — un retard n'est pas le même selon l'endroit.
 */
const CONTEXT_SUFFIX: Record<RuleContext, string> = {
  MATCH: ' en match',
  TRAINING: " à l'entraînement",
  OTHER: '',
}

/** Ce dont le calcul a besoin pour décerner les distinctions du classement. */
export type RankInput = {
  id: number
  displayName: string
  receivesFines: boolean
  fineCount: number
  totalOwed: number
  totalPaid: number
}

/**
 * En deçà, pas de distinction du dernier : à trois participants il est aussi
 * le premier ou son voisin immédiat, et porterait deux badges contraires.
 */
const MIN_FOR_LAST = 4

/**
 * Identifiant de participant → ses badges.
 *
 * Les distinctions de classement viennent en tête, les badges de règle
 * ensuite : l'ordre est stable d'un écran à l'autre, sans quoi les icônes
 * changeraient de place au gré des requêtes.
 */
export const loadBadges = async (
  members: RankInput[],
  /**
   * Les badges tels qu'ils étaient à cette date, en n'écoutant que les amendes
   * créées AVANT. Sert au résumé de la semaine, qui compare deux lundis.
   *
   * Les membres passés doivent alors être décomptés à la même date : le
   * classement, et donc l'euro et la couronne, en dépendent.
   */
  until?: Date,
): Promise<Map<number, MemberBadge[]>> => {
  const cutoff = until !== undefined
  const cutoffParams = cutoff ? [until] : []
  const byMember = new Map<number, MemberBadge[]>()
  const push = (id: number, badge: MemberBadge) =>
    byMember.set(id, [...(byMember.get(id) ?? []), badge])

  const ranked = rankedMembers(members)
  const total = (m: RankInput) => m.totalOwed + m.totalPaid

  // Les deux icônes sont choisies par l'admin, et `null` retire la distinction :
  // c'est la façon la plus simple de l'éteindre, sans interrupteur dédié.
  const icons = await queryOne<{
    first_badge_icon: BadgeImage | null
    last_badge_icon: BadgeImage | null
    first_fine_badge_icon: BadgeImage | null
  }>(
    'SELECT first_badge_icon, last_badge_icon, first_fine_badge_icon FROM settings WHERE id = 1',
  )

  // Distinction HISTORIQUE : elle ne change plus de porteur, sauf si l'amende
  // est supprimée. Les cotisations sont écartées — elles tombent sur toute
  // l'équipe d'un coup, personne ne les a « reçues en premier ».
  //
  // Départage par identifiant : un lot d'amendes créé en une transaction porte
  // le même `created_at`, NOW() étant figé pour toute la transaction. Sans ce
  // second critère, le porteur changerait d'une requête à l'autre.
  if (icons?.first_fine_badge_icon) {
    const pioneer = await queryOne<{ member_id: number; amount: number }>(
      `SELECT f.member_id, f.amount
         FROM fines f
         LEFT JOIN rules r ON r.id = f.rule_id
        WHERE f.status = 'CONFIRMED'
          AND (r.kind IS NULL OR r.kind <> 'DUES')
          ${cutoff ? 'AND f.created_at < $1' : ''}
        ORDER BY f.created_at ASC, f.id ASC
        LIMIT 1`,
      cutoffParams,
    )
    if (pioneer) {
      push(pioneer.member_id, {
        source: 'FIRST_FINE',
        icon: icons.first_fine_badge_icon,
        label: 'Première amende de la caisse',
        count: 1,
        amount: pioneer.amount,
      })
    }
  }

  // Pour ces deux-là, le décompte est celui de TOUTES leurs amendes : c'est ce
  // qui les a placés à cette extrémité du classement.
  const first = ranked[0]
  if (icons?.first_badge_icon && first && total(first) > 0) {
    push(first.id, {
      source: 'FIRST',
      icon: icons.first_badge_icon,
      label: 'Premier au classement',
      count: first.fineCount,
      amount: total(first),
    })
  }

  // La dernière place exige un ÉCART avec la première : sans ça, une équipe où
  // personne n'a d'amende distinguerait le dernier de l'alphabet.
  const last = ranked[ranked.length - 1]
  if (
    icons?.last_badge_icon &&
    last &&
    ranked.length >= MIN_FOR_LAST &&
    total(last) < total(ranked[0]!)
  ) {
    push(last.id, {
      source: 'LAST',
      icon: icons.last_badge_icon,
      label: 'Dernier au classement',
      count: last.fineCount,
      amount: total(last),
    })
  }

  for (const c of await query<ChampionRow>(championsSql(cutoff), cutoffParams)) {
    push(c.member_id, {
      source: 'RULE',
      icon: c.icon,
      label: `Le plus de ${c.rule_label}${CONTEXT_SUFFIX[c.rule_context]}`,
      count: c.fines,
      amount: c.euros,
    })
  }

  return byMember
}
