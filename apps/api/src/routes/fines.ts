import type { FastifyPluginAsync } from 'fastify'
import { createFineInput, setPaidInput, type Fine } from '@blackbox/shared'
import { query, queryOne, transaction } from '../db.js'
import { FINE_SQL, toFine, type FineRow } from '../queries.js'

export const fineRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }
  const staff = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN', 'MANAGER')],
  }

  /** Fil d'activité. Filtres : ?unpaid=1 et ?memberId=N */
  app.get('/fines', auth, async (req): Promise<Fine[]> => {
    const q = req.query as { unpaid?: string; memberId?: string }

    const conditions: string[] = []
    const params: unknown[] = []

    if (q.unpaid === '1') conditions.push('f.paid_at IS NULL')

    if (q.memberId) {
      const memberId = Number(q.memberId)
      if (!Number.isInteger(memberId) || memberId <= 0) {
        throw app.httpErrors.badRequest('memberId invalide')
      }
      params.push(memberId)
      conditions.push(`f.member_id = $${params.length}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await query<FineRow>(
      `${FINE_SQL} ${where} ORDER BY f.created_at DESC LIMIT 500`,
      params,
    )
    return rows.map(toFine)
  })

  /** Une règle, un ou plusieurs joueurs, une seule transaction. */
  app.post('/fines', staff, async (req, reply): Promise<Fine[]> => {
    const body = createFineInput.parse(req.body)
    const authorMemberId = req.currentUser.memberId!
    // Deux fois le même joueur dans la sélection ne doit pas donner deux amendes.
    const memberIds = [...new Set(body.memberIds)]

    const ids = await transaction(async (client) => {
      // On copie label et amount ici, une fois pour toutes.
      const { rows: rules } = await client.query<{ label: string; amount: number }>(
        'SELECT label, amount FROM rules WHERE id = $1 AND archived_at IS NULL',
        [body.ruleId],
      )
      if (!rules.length) throw app.httpErrors.badRequest('Règle inconnue ou archivée')

      // Une règle à paliers n'a pas de montant propre : c'est le palier qui
      // décide. L'un exclut donc strictement l'autre.
      const { rows: tiers } = await client.query<{ id: number; label: string; amount: number }>(
        'SELECT id, label, amount FROM rule_tiers WHERE rule_id = $1',
        [body.ruleId],
      )

      let amount = rules[0]!.amount
      let label = rules[0]!.label

      if (tiers.length) {
        if (!body.tierId) throw app.httpErrors.badRequest('Cette règle exige un palier')
        const tier = tiers.find((t) => t.id === body.tierId)
        if (!tier) throw app.httpErrors.badRequest('Palier inconnu')
        amount = tier.amount
        label = `${rules[0]!.label} · ${tier.label}`
      } else if (body.tierId) {
        throw app.httpErrors.badRequest('Cette règle n’a pas de palier')
      }

      const { rows: found } = await client.query<{ id: number }>(
        'SELECT id FROM members WHERE id = ANY($1::int[])',
        [memberIds],
      )
      // Tout ou rien : une sélection contenant un membre supprimé entre-temps
      // ne doit pas créer un lot d'amendes à moitié appliqué.
      if (found.length !== memberIds.length) throw app.httpErrors.badRequest('Membre inconnu')

      // UNNEST : une seule requête quel que soit le nombre de joueurs.
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO fines (member_id, rule_id, amount, label, created_by)
         SELECT m, $2, $3, $4, $5 FROM UNNEST($1::int[]) AS m
         RETURNING id`,
        [memberIds, body.ruleId, amount, label, authorMemberId],
      )
      return rows.map((r) => r.id)
    })

    reply.code(201)
    return Promise.all(ids.map(loadFine))
  })

  /**
   * Seul point d'entrée pour marquer une amende payée, depuis le fil d'activité.
   * Un joueur ne peut jamais cocher ses propres amendes.
   */
  app.patch('/fines/:id/paid', staff, async (req): Promise<Fine> => {
    const id = parseId(req.params)
    const body = setPaidInput.parse(req.body)

    const updated = await queryOne<{ id: number }>(
      `UPDATE fines
          SET paid_at = CASE WHEN $2::boolean THEN COALESCE(paid_at, NOW()) ELSE NULL END
        WHERE id = $1
        RETURNING id`,
      [id, body.paid],
    )
    if (!updated) throw app.httpErrors.notFound('Amende introuvable')

    return loadFine(id)
  })

  /** Correction d'une saisie erronée : le gestionnaire doit pouvoir se rattraper. */
  app.delete('/fines/:id', staff, async (req, reply) => {
    const id = parseId(req.params)
    const deleted = await queryOne<{ id: number }>(
      'DELETE FROM fines WHERE id = $1 RETURNING id',
      [id],
    )
    if (!deleted) throw app.httpErrors.notFound('Amende introuvable')
    reply.code(204)
  })

  const parseId = (params: unknown): number => {
    const id = Number((params as { id?: string }).id)
    if (!Number.isInteger(id) || id <= 0) throw app.httpErrors.badRequest('Identifiant invalide')
    return id
  }

  const loadFine = async (id: number): Promise<Fine> => {
    const row = await queryOne<FineRow>(`${FINE_SQL} WHERE f.id = $1`, [id])
    if (!row) throw app.httpErrors.notFound('Amende introuvable')
    return toFine(row)
  }
}
