import type { FastifyPluginAsync } from 'fastify'
import {
  createMemberInput,
  updateMemberInput,
  updateRoleInput,
  type Dashboard,
  type MemberDetail,
  type MemberSummary,
} from '@blackbox/shared'
import { query, queryOne } from '../db.js'
import {
  FINE_SQL,
  MEMBER_SUMMARY_SQL,
  toFine,
  toMemberSummary,
  type FineRow,
  type MemberSummaryRow,
} from '../queries.js'

export const memberRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }
  const staff = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN', 'MANAGER')],
  }
  const adminOnly = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN')],
  }

  /** Écran Classement : totaux de la caisse + membres triés par montant dû. */
  app.get('/dashboard', auth, async (): Promise<Dashboard> => {
    const rows = await query<MemberSummaryRow>(
      `${MEMBER_SUMMARY_SQL} ORDER BY total_owed DESC, m.display_name`,
    )
    const settings = await queryOne<{ late_after_days: number }>(
      'SELECT late_after_days FROM settings WHERE id = 1',
    )
    const members = rows.map(toMemberSummary)

    return {
      lateAfterDays: settings!.late_after_days,
      totalOwed: members.reduce((sum, m) => sum + m.totalOwed, 0),
      totalPaid: members.reduce((sum, m) => sum + m.totalPaid, 0),
      members,
    }
  })

  app.get('/members', auth, async (): Promise<MemberSummary[]> => {
    const rows = await query<MemberSummaryRow>(
      `${MEMBER_SUMMARY_SQL} ORDER BY m.display_name`,
    )
    return rows.map(toMemberSummary)
  })

  app.post('/members', staff, async (req, reply): Promise<MemberSummary> => {
    const body = createMemberInput.parse(req.body)

    const created = await queryOne<{ id: number }>(
      'INSERT INTO members (display_name) VALUES ($1) RETURNING id',
      [body.displayName],
    )

    reply.code(201)
    return loadMember(created!.id)
  })

  /** `/members/me` doit être déclaré avant `/members/:id`, sinon "me" est lu comme un id. */
  app.get('/members/me', auth, async (req): Promise<MemberDetail> =>
    loadMemberDetail(req.currentUser.memberId!),
  )

  app.get('/members/:id', auth, async (req): Promise<MemberDetail> => {
    const id = parseId(req.params)
    return loadMemberDetail(id)
  })

  app.patch('/members/:id', staff, async (req): Promise<MemberSummary> => {
    const id = parseId(req.params)
    const body = updateMemberInput.parse(req.body)

    // COALESCE : on ne réécrit que les champs réellement fournis.
    const updated = await queryOne<{ id: number }>(
      `UPDATE members
          SET display_name = COALESCE($2, display_name)
        WHERE id = $1
        RETURNING id`,
      [id, body.displayName ?? null],
    )
    if (!updated) throw app.httpErrors.notFound('Membre introuvable')

    return loadMember(id)
  })

  /** Promotion / rétrogradation MANAGER. Le rôle ADMIN n'est pas transférable en V1. */
  app.patch('/users/:id/role', adminOnly, async (req) => {
    const id = parseId(req.params)
    const body = updateRoleInput.parse(req.body)

    if (id === req.currentUser.id) {
      throw app.httpErrors.badRequest('Tu ne peux pas modifier ton propre rôle')
    }

    const target = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [id])
    if (!target) throw app.httpErrors.notFound('Compte introuvable')
    if (target.role === 'ADMIN') throw app.httpErrors.badRequest('Le rôle ADMIN est verrouillé')

    await query('UPDATE users SET role = $2 WHERE id = $1', [id, body.role])
    return { ok: true }
  })

  const parseId = (params: unknown): number => {
    const raw = (params as { id?: string }).id
    const id = Number(raw)
    if (!Number.isInteger(id) || id <= 0) throw app.httpErrors.badRequest('Identifiant invalide')
    return id
  }

  const loadMember = async (id: number): Promise<MemberSummary> => {
    const row = await queryOne<MemberSummaryRow>(
      `${MEMBER_SUMMARY_SQL} HAVING m.id = $1`,
      [id],
    )
    if (!row) throw app.httpErrors.notFound('Membre introuvable')
    return toMemberSummary(row)
  }

  const loadMemberDetail = async (id: number): Promise<MemberDetail> => {
    const summary = await loadMember(id)
    const fines = await query<FineRow>(
      `${FINE_SQL} WHERE f.member_id = $1 ORDER BY f.paid_at IS NOT NULL, f.created_at DESC`,
      [id],
    )
    return { ...summary, fines: fines.map(toFine) }
  }
}
