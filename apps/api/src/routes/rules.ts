import type { FastifyPluginAsync } from 'fastify'
import {
  createRuleInput,
  updateRuleInput,
  type ApplyRuleResult,
  type BadgeImage,
  type Rule,
  type RuleCadence,
  type RuleContext,
  type RuleKind,
  type RuleTier,
} from '@blackbox/shared'
import { query, queryOne, transaction } from '../db.js'
import { IS_LATE_SQL } from '../queries.js'
import { notifyNewFines } from '../push.js'

type RuleRow = {
  id: number
  label: string
  description: string | null
  amount: number
  kind: RuleKind
  context: RuleContext
  badge_icon: BadgeImage | null
  cadence: RuleCadence | null
  reminder_day: number | null
  reminder_hour: number | null
  tiers: RuleTier[]
  archived_at: Date | null
  last_applied_at: Date | null
}

const toRule = (r: RuleRow): Rule => ({
  id: r.id,
  label: r.label,
  description: r.description,
  amount: r.amount,
  kind: r.kind,
  context: r.context,
  badgeIcon: r.badge_icon,
  cadence: r.cadence,
  reminderDay: r.reminder_day,
  reminderHour: r.reminder_hour,
  tiers: r.tiers,
  archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
  lastAppliedAt: r.last_applied_at ? r.last_applied_at.toISOString() : null,
})

// Les paliers sont agrégés en JSON : une seule requête, et `pg` les rend
// directement sous forme de tableau d'objets.
const TIERS_SQL = `
  COALESCE(
    (SELECT json_agg(json_build_object('id', t.id, 'label', t.label, 'amount', t.amount)
                     ORDER BY t.position, t.id)
       FROM rule_tiers t WHERE t.rule_id = r.id),
    '[]'::json
  )`

/** Remplace tous les paliers d'une règle. La position vient de l'ordre reçu. */
const replaceTiers = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  ruleId: number,
  tiers: { label: string; amount: number }[],
) => {
  await client.query('DELETE FROM rule_tiers WHERE rule_id = $1', [ruleId])
  if (!tiers.length) return
  await client.query(
    `INSERT INTO rule_tiers (rule_id, label, amount, position)
     SELECT $1, * FROM UNNEST($2::text[], $3::int[], $4::int[])`,
    [ruleId, tiers.map((t) => t.label), tiers.map((t) => t.amount), tiers.map((_, i) => i)],
  )
}

const SELECT = `
  SELECT r.id, r.label, r.description, r.amount, r.kind, r.context, r.badge_icon, r.cadence, r.reminder_day, r.reminder_hour, r.archived_at,
         ${TIERS_SQL} AS tiers,
         (SELECT MAX(f.created_at) FROM fines f WHERE f.rule_id = r.id) AS last_applied_at
    FROM rules r`

export const ruleRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }
  const staff = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN', 'MANAGER')],
  }

  app.get('/rules', auth, async (req): Promise<Rule[]> => {
    // L'archive ne s'ouvre qu'à ceux qui peuvent désarchiver. Un joueur qui
    // forgerait `?archived=1` reçoit les règles actives, pas une erreur : le
    // paramètre relève de l'affichage, et un 403 casserait tout l'écran Règles
    // pour un réglage que le front ne lui propose même pas.
    const isStaff = req.currentUser.role === 'ADMIN' || req.currentUser.role === 'MANAGER'
    const includeArchived = isStaff && (req.query as { archived?: string }).archived === '1'
    const rows = await query<RuleRow>(
      `${SELECT}
        ${includeArchived ? '' : 'WHERE r.archived_at IS NULL'}
        ORDER BY r.archived_at NULLS FIRST, r.amount DESC, r.label`,
    )
    return rows.map(toRule)
  })

  /**
   * Une fonctionnalité coupée par l'admin ne doit pas pouvoir être alimentée
   * en douce : le front masque la section, le serveur refuse la création.
   */
  const assertKindEnabled = async (kind: RuleKind) => {
    if (kind === 'FINE') return
    const row = await queryOne<{ enable_penalties: boolean; enable_dues: boolean }>(
      'SELECT enable_penalties, enable_dues FROM settings WHERE id = 1',
    )
    const enabled = kind === 'PENALTY' ? row?.enable_penalties : row?.enable_dues
    if (!enabled) {
      throw app.httpErrors.forbidden(
        kind === 'PENALTY' ? 'Les pénalités sont désactivées' : 'Les cotisations sont désactivées',
      )
    }
  }

  app.post('/rules', staff, async (req, reply): Promise<Rule> => {
    const body = createRuleInput.parse(req.body)
    await assertKindEnabled(body.kind)
    if (body.kind !== 'FINE' && body.tiers.length) {
      throw app.httpErrors.badRequest('Seule une règle d’infraction peut avoir des paliers')
    }

    // Une seule cotisation et une seule pénalité de retard, par choix : elles
    // portent un rythme et un délai qui décrivent la caisse entière, et deux
    // rythmes concurrents ne voudraient rien dire. Les archivées ne comptent
    // pas — en archiver une libère la place pour sa remplaçante.
    if (body.kind !== 'FINE') {
      const existing = await queryOne<{ id: number }>(
        'SELECT id FROM rules WHERE kind = $1 AND archived_at IS NULL LIMIT 1',
        [body.kind],
      )
      if (existing) {
        throw app.httpErrors.conflict(
          body.kind === 'DUES'
            ? 'Il existe déjà une cotisation'
            : 'Il existe déjà une pénalité de retard',
        )
      }
    }

    const id = await transaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO rules (label, description, amount, kind, context, badge_icon, cadence,
                            reminder_day, reminder_hour)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          body.label,
          body.description ?? null,
          body.amount,
          body.kind,
          body.context,
          body.badgeIcon ?? null,
          // Le rythme ne veut rien dire sur une infraction : elle tombe quand
          // quelqu'un la commet, elle n'est en retard de rien.
          body.kind === 'FINE' ? null : (body.cadence ?? null),
          // Sans rythme, « chaque lundi » ne veut rien dire : le créneau tombe
          // avec lui.
          body.cadence ? (body.reminderDay ?? null) : null,
          body.cadence ? (body.reminderHour ?? null) : null,
        ],
      )
      await replaceTiers(client, rows[0]!.id, body.tiers)
      return rows[0]!.id
    })

    reply.code(201)
    return loadRule(id)
  })

  app.patch('/rules/:id', staff, async (req): Promise<Rule> => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isInteger(id) || id <= 0) throw app.httpErrors.badRequest('Identifiant invalide')

    const body = updateRuleInput.parse(req.body)

    // Modifier une règle ne touche PAS aux amendes déjà posées : leurs amount
    // et label sont des copies. Changer un tarif en janvier ne réécrit pas
    // l'historique de septembre.
    const row = await queryOne<RuleRow>(
      `UPDATE rules
          SET label       = COALESCE($2, label),
              description = CASE WHEN $3::boolean THEN $4 ELSE description END,
              amount      = COALESCE($5, amount),
              context     = COALESCE($7, context),
              -- Comme pour la description : un booléen de présence, sinon
              -- « retirer l'icône » et « ne pas y toucher » seraient tous deux
              -- NULL et le retrait deviendrait impossible.
              badge_icon  = CASE WHEN $8::boolean THEN $9 ELSE badge_icon END,
              -- Même mécanique, et une infraction ne garde jamais de rythme :
              -- c'est la règle qui connaît son type, pas le formulaire.
              cadence     = CASE
                              WHEN NOT $10::boolean THEN cadence
                              WHEN kind <> 'FINE' THEN $11
                              ELSE NULL
                            END,
              -- Le créneau suit le rythme : retirer le rythme retire le
              -- rappel, sinon il resterait un « chaque lundi » sans semaine.
              reminder_day  = CASE
                                WHEN $12::boolean THEN $13
                                WHEN $10::boolean AND $11 IS NULL THEN NULL
                                ELSE reminder_day
                              END,
              reminder_hour = CASE
                                WHEN $14::boolean THEN $15
                                WHEN $10::boolean AND $11 IS NULL THEN NULL
                                ELSE reminder_hour
                              END,
              archived_at = CASE
                              WHEN $6::boolean IS NULL THEN archived_at
                              WHEN $6::boolean THEN COALESCE(archived_at, NOW())
                              ELSE NULL
                            END
        WHERE id = $1
        RETURNING id, label, description, amount, kind, context, badge_icon, cadence,
                  reminder_day, reminder_hour, archived_at,
                  (SELECT MAX(f.created_at) FROM fines f WHERE f.rule_id = rules.id)
                    AS last_applied_at`,
      [
        id,
        body.label ?? null,
        body.description !== undefined,
        body.description ?? null,
        body.amount ?? null,
        body.archived ?? null,
        body.context ?? null,
        body.badgeIcon !== undefined,
        body.badgeIcon ?? null,
        body.cadence !== undefined,
        body.cadence ?? null,
        body.reminderDay !== undefined,
        body.reminderDay ?? null,
        body.reminderHour !== undefined,
        body.reminderHour ?? null,
      ],
    )
    if (!row) throw app.httpErrors.notFound('Règle introuvable')

    // `tiers` absent = paliers inchangés. Fourni = il remplace toute la liste.
    if (body.tiers) {
      if (row.kind !== 'FINE' && body.tiers.length) {
        throw app.httpErrors.badRequest('Seule une règle d’infraction peut avoir des paliers')
      }
      await transaction((client) => replaceTiers(client, id, body.tiers!))
      return loadRule(id)
    }

    return toRule(row)
  })

  const loadRule = async (id: number): Promise<Rule> => {
    const row = await queryOne<RuleRow>(`${SELECT} WHERE r.id = $1`, [id])
    if (!row) throw app.httpErrors.notFound('Règle introuvable')
    return toRule(row)
  }

  /**
   * Applique une règle en un clic, en une transaction.
   *
   * La CIBLE se déduit de la nature de la règle et n'est jamais envoyée par le
   * client : DUES vise toute l'équipe, PENALTY les seuls retardataires.
   * Un front pas à jour ne peut donc pas débiter les mauvaises personnes.
   */
  app.post('/rules/:id/apply', staff, async (req): Promise<ApplyRuleResult> => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isInteger(id) || id <= 0) throw app.httpErrors.badRequest('Identifiant invalide')

    const authorMemberId = req.currentUser.memberId!

    const created = await transaction(async (client) => {
      const { rows: rules } = await client.query<{
        label: string
        amount: number
        kind: RuleKind
      }>('SELECT label, amount, kind FROM rules WHERE id = $1 AND archived_at IS NULL', [id])
      if (!rules.length) throw app.httpErrors.notFound('Règle inconnue ou archivée')

      const rule = rules[0]!
      if (rule.kind === 'FINE') {
        throw app.httpErrors.badRequest(
          "Une règle d'infraction se donne depuis l'écran d'ajout d'amende",
        )
      }
      await assertKindEnabled(rule.kind)

      // Un membre exempté n'est la cible d'aucune application : la condition
      // vaut pour les cotisations comme pour les pénalités, seul le critère de
      // retard s'y ajoute.
      //
      // Le sous-SELECT est évalué sur l'état d'AVANT l'insertion : les amendes
      // créées par cette requête ne rendent donc personne éligible en cascade.
      const conditions = ['m.receives_fines']
      if (rule.kind === 'PENALTY') {
        conditions.push(`EXISTS (
          SELECT 1 FROM fines f CROSS JOIN settings s
           WHERE f.member_id = m.id AND ${IS_LATE_SQL}
        )`)
      }
      const targetFilter = `WHERE ${conditions.join(' AND ')}`

      // RETURNING : on récupère les identifiants pour notifier les joueurs
      // concernés, exactement comme lors d'une saisie individuelle.
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO fines (member_id, rule_id, amount, label, created_by)
         SELECT m.id, $1, $2, $3, $4 FROM members m ${targetFilter}
         RETURNING id`,
        [id, rule.amount, rule.label, authorMemberId],
      )
      return rows.map((r) => r.id)
    })

    void notifyNewFines(created).catch((err) => req.log.error({ err }, 'notification échouée'))

    return { created: created.length }
  })
}
