import type { Fine, FineStatus, MemberSummary, Role } from '@blackbox/shared'

/**
 * Fragments SQL partagés entre plusieurs routes.
 * Sans ORM, c'est ici qu'on évite de dupliquer — et de faire diverger — les
 * calculs de totaux et de retard.
 */

/**
 * Une amende impayée est « en retard » quand sa date de création + N jours
 * est atteinte, N venant de settings.late_after_days.
 *
 * On compare des DATES calendaires, pas des durées : une amende du lundi
 * bascule à minuit le lundi suivant, pas à l'heure exacte de saisie.
 * Le AT TIME ZONE est indispensable des deux côtés — sans lui une amende
 * saisie à 23 h en été est datée du lendemain en UTC et bascule un jour trop tard.
 */
export const IS_LATE_SQL = `
  f.status = 'CONFIRMED'
  AND f.paid_at IS NULL
  AND (f.created_at AT TIME ZONE 'Europe/Paris')::date + s.late_after_days
      <= (NOW() AT TIME ZONE 'Europe/Paris')::date
`

/**
 * « Majorée » : en retard, et majorée il y a moins que le délai.
 *
 * Même délai que pour le retard, même comparaison de dates calendaires. Une
 * amende majorée reste en retard au sens du paiement — le joueur n'a toujours
 * pas payé —, elle est seulement protégée contre une seconde pénalité.
 */
export const IS_PENALIZED_SQL = `
  (${IS_LATE_SQL})
  AND f.penalized_at IS NOT NULL
  AND (f.penalized_at AT TIME ZONE 'Europe/Paris')::date + s.late_after_days
      > (NOW() AT TIME ZONE 'Europe/Paris')::date
`

/**
 * Ce que le bouton des pénalités va majorer : en retard, et PAS majorée.
 *
 * Partagé entre l'application et le décompte affiché, pour que le bouton ne
 * promette jamais un nombre différent de ce qui sera créé.
 */
export const IS_PENALIZABLE_SQL = `
  (${IS_LATE_SQL})
  AND NOT (
    f.penalized_at IS NOT NULL
    AND (f.penalized_at AT TIME ZONE 'Europe/Paris')::date + s.late_after_days
        > (NOW() AT TIME ZONE 'Europe/Paris')::date
  )
`

export type MemberSummaryRow = {
  id: number
  display_name: string
  user_id: number | null
  role: Role | null
  receives_fines: boolean
  total_owed: number
  total_paid: number
  has_late: boolean
  fine_count: number
  penalizable_count: number
}

/** Colonnes explicites : jamais de SELECT *, sinon les types TS mentent. */
export const MEMBER_SUMMARY_SQL = `
  SELECT m.id,
         m.display_name,
         m.user_id,
         u.role,
         m.receives_fines,
         -- Un signalement en attente ne compte NULLE PART tant qu'il n'est pas
         -- validé : ni dans le dû, ni dans le payé, ni dans le retard. Sinon la
         -- cagnotte afficherait de l'argent qu'un gestionnaire n'a pas entériné.
         COALESCE(SUM(f.amount) FILTER (
           WHERE f.status = 'CONFIRMED' AND f.paid_at IS NULL), 0)::int         AS total_owed,
         COALESCE(SUM(f.amount) FILTER (
           WHERE f.status = 'CONFIRMED' AND f.paid_at IS NOT NULL), 0)::int     AS total_paid,
         COALESCE(BOOL_OR(${IS_LATE_SQL}), FALSE)                              AS has_late,
         -- Compté et non déduit des montants : une règle peut valoir 0 €
         -- (une tournée, un gâteau), et un signalement en attente n'a encore
         -- rien reçu.
         COUNT(f.id) FILTER (WHERE f.status = 'CONFIRMED')::int                AS fine_count,
         -- Ce que le bouton des pénalités majorerait maintenant. Calculé ici
         -- avec le même fragment que l'application, pour que le décompte
         -- affiché ne diverge jamais de ce qui sera réellement créé.
         COUNT(f.id) FILTER (WHERE ${IS_PENALIZABLE_SQL})::int               AS penalizable_count
    FROM members m
    LEFT JOIN users u   ON u.id = m.user_id
    LEFT JOIN fines f   ON f.member_id = m.id
    CROSS JOIN settings s
   GROUP BY m.id, u.role
`

/**
 * Total des amendes validées d'un membre, payées ou non — le critère du
 * classement.
 *
 * Répété tel quel plutôt que d'écrire `total_owed + total_paid` : PostgreSQL
 * n'accepte un alias de colonne dans ORDER BY que seul, jamais dans une
 * expression, et ces deux-là n'existent pas dans les tables sources.
 */
export const MEMBER_TOTAL_SQL = `COALESCE(SUM(f.amount) FILTER (WHERE f.status = 'CONFIRMED'), 0)`

export const toMemberSummary = (r: MemberSummaryRow): MemberSummary => ({
  id: r.id,
  displayName: r.display_name,
  userId: r.user_id,
  role: r.role,
  receivesFines: r.receives_fines,
  totalOwed: r.total_owed,
  totalPaid: r.total_paid,
  hasLate: r.has_late,
  fineCount: r.fine_count,
  penalizableCount: r.penalizable_count,
  // Rempli par loadBadges() dans les routes : le calcul a besoin de TOUS les
  // membres, il ne peut donc pas se faire ligne par ligne ici.
  badges: [],
})

export type FineRow = {
  id: number
  member_id: number
  member_name: string
  rule_id: number | null
  amount: number
  label: string
  created_at: Date
  paid_at: Date | null
  created_by_name: string | null
  created_by: number | null
  status: FineStatus
  is_late: boolean
  is_penalized: boolean
}

export const FINE_SQL = `
  SELECT f.id,
         f.member_id,
         m.display_name  AS member_name,
         f.rule_id,
         f.amount,
         f.label,
         f.created_at,
         f.paid_at,
         cb.display_name AS created_by_name,
         f.created_by,
         f.status,
         (${IS_LATE_SQL}) AS is_late,
         (${IS_PENALIZED_SQL}) AS is_penalized
    FROM fines f
    JOIN members m       ON m.id = f.member_id
    LEFT JOIN members cb ON cb.id = f.created_by
    CROSS JOIN settings s
`

export const toFine = (r: FineRow): Fine => ({
  id: r.id,
  memberId: r.member_id,
  memberName: r.member_name,
  ruleId: r.rule_id,
  amount: r.amount,
  label: r.label,
  createdAt: r.created_at.toISOString(),
  paidAt: r.paid_at ? r.paid_at.toISOString() : null,
  createdByName: r.created_by_name,
  createdById: r.created_by,
  status: r.status,
  isLate: r.is_late,
  isPenalized: r.is_penalized,
})
