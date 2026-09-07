import {
  rankedMembers,
  type AnyBadgeIcon,
  type BadgeIcon,
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
  icon: BadgeIcon
  rule_label: string
  rule_context: RuleContext
  fines: number
  euros: number
}

/**
 * Le champion de chaque règle qui décerne un badge.
 *
 * Départage, dans l'ordre : le plus d'amendes, puis le plus gros montant cumulé
 * de ce type, puis le premier à avoir atteint ce total — sa toute première
 * amende de cette règle. Trois critères pour qu'il n'y ait jamais deux
 * porteurs, ni de badge non attribué.
 *
 * `DISTINCT ON` retient la première ligne de chaque règle une fois l'ordre posé :
 * c'est exactement « l'argmax », sans sous-requête.
 */
const CHAMPIONS_SQL = `
  SELECT DISTINCT ON (f.rule_id)
         f.member_id,
         r.badge_icon                AS icon,
         r.label                     AS rule_label,
         r.context                   AS rule_context,
         COUNT(*)::int               AS fines,
         SUM(f.amount)::int          AS euros
    FROM fines f
    JOIN rules r ON r.id = f.rule_id
   WHERE f.status = 'CONFIRMED'
     AND r.badge_icon IS NOT NULL
     AND r.kind = 'FINE'
     -- Une règle archivée ne décerne plus rien : elle ne se donne plus, donc
     -- son champion est figé et le badge n'a plus de sens.
     --
     -- Filtré ici plutôt qu'en effaçant l'icône à l'archivage : rien dans ce
     -- système n'est stocké, et l'archivage se défait. Désarchiver rend donc le
     -- badge, au lieu d'obliger à rechoisir l'icône.
     AND r.archived_at IS NULL
   GROUP BY f.rule_id, f.member_id, r.badge_icon, r.label, r.context
   ORDER BY f.rule_id,
            COUNT(*) DESC,
            SUM(f.amount) DESC,
            MIN(f.created_at) ASC
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
type RankInput = {
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
export const loadBadges = async (members: RankInput[]): Promise<Map<number, MemberBadge[]>> => {
  const byMember = new Map<number, MemberBadge[]>()
  const push = (id: number, badge: MemberBadge) =>
    byMember.set(id, [...(byMember.get(id) ?? []), badge])

  const ranked = rankedMembers(members)
  const total = (m: RankInput) => m.totalOwed + m.totalPaid

  // Les deux icônes sont choisies par l'admin, et `null` retire la distinction :
  // c'est la façon la plus simple de l'éteindre, sans interrupteur dédié.
  const icons = await queryOne<{
    first_badge_icon: AnyBadgeIcon | null
    last_badge_icon: AnyBadgeIcon | null
    first_fine_badge_icon: AnyBadgeIcon | null
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
        ORDER BY f.created_at ASC, f.id ASC
        LIMIT 1`,
    )
    if (pioneer) {
      push(pioneer.member_id, {
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
      icon: icons.last_badge_icon,
      label: 'Dernier au classement',
      count: last.fineCount,
      amount: total(last),
    })
  }

  for (const c of await query<ChampionRow>(CHAMPIONS_SQL)) {
    push(c.member_id, {
      icon: c.icon,
      label: `Le plus de ${c.rule_label}${CONTEXT_SUFFIX[c.rule_context]}`,
      count: c.fines,
      amount: c.euros,
    })
  }

  return byMember
}
