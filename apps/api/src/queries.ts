import type { Fine, MemberSummary, Role } from '@blackbox/shared'

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
  f.paid_at IS NULL
  AND (f.created_at AT TIME ZONE 'Europe/Paris')::date + s.late_after_days
      <= (NOW() AT TIME ZONE 'Europe/Paris')::date
`

export type MemberSummaryRow = {
  id: number
  display_name: string
  user_id: number | null
  role: Role | null
  total_owed: number
  total_paid: number
  has_late: boolean
}

/** Colonnes explicites : jamais de SELECT *, sinon les types TS mentent. */
export const MEMBER_SUMMARY_SQL = `
  SELECT m.id,
         m.display_name,
         m.user_id,
         u.role,
         COALESCE(SUM(f.amount) FILTER (WHERE f.paid_at IS NULL), 0)::int      AS total_owed,
         COALESCE(SUM(f.amount) FILTER (WHERE f.paid_at IS NOT NULL), 0)::int  AS total_paid,
         COALESCE(BOOL_OR(${IS_LATE_SQL}), FALSE)                              AS has_late
    FROM members m
    LEFT JOIN users u   ON u.id = m.user_id
    LEFT JOIN fines f   ON f.member_id = m.id
    CROSS JOIN settings s
   GROUP BY m.id, u.role
`

export const toMemberSummary = (r: MemberSummaryRow): MemberSummary => ({
  id: r.id,
  displayName: r.display_name,
  userId: r.user_id,
  role: r.role,
  totalOwed: r.total_owed,
  totalPaid: r.total_paid,
  hasLate: r.has_late,
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
  is_late: boolean
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
         (${IS_LATE_SQL}) AS is_late
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
  isLate: r.is_late,
})
