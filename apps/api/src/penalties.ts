import type pg from 'pg'
import { IS_PENALIZABLE_SQL } from './queries.js'

/** La pénalité de retard telle qu'elle se copie dans chaque amende créée. */
export type PenaltyRule = { id: number; label: string; amount: number }

/**
 * Majore des amendes : une pénalité par amende visée — une par amende, pas
 * une par joueur.
 *
 * Partagé entre deux gestes qui ne visent pas la même chose :
 *  - le bouton de l'écran Règles majore TOUT ce qui est en retard et pas
 *    encore majoré. C'est le geste automatique, il suit le délai ;
 *  - le mode gestion du fil majore UNE amende choisie, quelle qu'elle soit
 *    tant qu'elle est validée et impayée — même pas encore en retard, même
 *    déjà majorée. C'est une décision du gestionnaire, pas du calendrier.
 *
 * La majoration manuelle pose aussi la date de majoration : l'amende est donc
 * protégée du bouton collectif pendant le délai, comme après un clic sur
 * celui-ci.
 *
 * Trois temps dans une seule requête :
 *  1. les amendes visées, verrouillées : deux gestionnaires qui cliquent en
 *     même temps ne majorent pas deux fois la même ;
 *  2. leur date de majoration, posée à maintenant : elles deviennent
 *     « majorées » et le clic suivant les ignorera pendant le délai ;
 *  3. une pénalité par amende marquée.
 *
 * Toutes les parties d'une requête voient l'état d'AVANT : les pénalités
 * créées ici ne sont donc pas elles-mêmes majorées dans le même clic. Elles
 * le seront au suivant, une fois leur propre délai écoulé.
 *
 * Un membre exempté n'est jamais visé, même s'il traîne un historique.
 *
 * Renvoie les identifiants des pénalités créées.
 */
export const penalize = async (
  client: pg.PoolClient,
  rule: PenaltyRule,
  authorMemberId: number,
  /** Une seule amende, choisie à la main. Absent : tout ce qui est en retard. */
  fineId?: number,
): Promise<number[]> => {
  const target =
    fineId === undefined
      ? IS_PENALIZABLE_SQL
      : `f.id = $5 AND f.status = 'CONFIRMED' AND f.paid_at IS NULL`

  const { rows } = await client.query<{ id: number }>(
    `WITH targets AS (
       SELECT f.id, f.member_id
         FROM fines f
         JOIN members m ON m.id = f.member_id
         CROSS JOIN settings s
        WHERE m.receives_fines AND ${target}
        FOR UPDATE OF f
     ),
     marked AS (
       UPDATE fines SET penalized_at = NOW()
        WHERE id IN (SELECT id FROM targets)
        RETURNING member_id
     )
     INSERT INTO fines (member_id, rule_id, amount, label, created_by)
     SELECT member_id, $1, $2, $3, $4 FROM marked
     RETURNING id`,
    fineId === undefined
      ? [rule.id, rule.amount, rule.label, authorMemberId]
      : [rule.id, rule.amount, rule.label, authorMemberId, fineId],
  )
  return rows.map((r) => r.id)
}
