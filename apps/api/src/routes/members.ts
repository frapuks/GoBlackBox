import type { FastifyPluginAsync } from 'fastify'
import {
  createMemberInput,
  updateMemberInput,
  updateRoleInput,
  type Dashboard,
  type MemberDetail,
  type MemberSummary,
  type ResetPasswordResult,
} from '@blackbox/shared'
import { generateTemporaryPassword, hashPassword } from '../auth.js'
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

  // Ajouter un participant change la composition de l'équipe : administration,
  // au même titre que les rôles.
  app.post('/members', adminOnly, async (req, reply): Promise<MemberSummary> => {
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

  // Même niveau que le rôle et le détachement : c'est le formulaire de
  // modification d'un participant, et il est réservé à l'admin de bout en bout.
  // Décider qui est amendable, en particulier, décide qui paie.
  app.patch('/members/:id', adminOnly, async (req): Promise<MemberSummary> => {
    const id = parseId(req.params)
    const body = updateMemberInput.parse(req.body)

    // COALESCE : on ne réécrit que les champs réellement fournis.
    const updated = await queryOne<{ id: number }>(
      `UPDATE members
          SET display_name   = COALESCE($2, display_name),
              receives_fines = COALESCE($3, receives_fines)
        WHERE id = $1
        RETURNING id`,
      [id, body.displayName ?? null, body.receivesFines ?? null],
    )
    if (!updated) throw app.httpErrors.notFound('Membre introuvable')

    return loadMember(id)
  })

  /**
   * Détache le compte du participant.
   *
   * Sert à rattraper l'erreur d'un joueur qui, à l'inscription, a réclamé le
   * mauvais nom dans la liste. Le participant redevient « fantôme » avec tout
   * son historique d'amendes, et le compte se retrouve sans membre : au
   * prochain chargement, l'app le renvoie vers « Qui es-tu ? » pour qu'il
   * choisisse correctement.
   *
   * Rien n'est supprimé — ni le compte, ni les amendes du participant.
   */
  app.post('/members/:id/unlink', adminOnly, async (req): Promise<MemberSummary> => {
    const id = parseId(req.params)

    // Se détacher soi-même est récupérable — il suffit de réclamer à nouveau —
    // mais l'admin perd entre-temps l'accès à toutes les routes qui exigent un
    // membre. Autant l'empêcher plutôt que d'avoir à s'en sortir.
    if (id === req.currentUser.memberId) {
      throw app.httpErrors.badRequest('Tu ne peux pas détacher ton propre compte')
    }

    const updated = await queryOne<{ id: number }>(
      'UPDATE members SET user_id = NULL WHERE id = $1 AND user_id IS NOT NULL RETURNING id',
      [id],
    )
    if (!updated) throw app.httpErrors.notFound('Membre introuvable ou déjà sans compte')

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

  /**
   * Mot de passe oublié, sans email : l'admin en génère un temporaire et le
   * transmet lui-même. Il n'est jamais stocké en clair et n'est renvoyé qu'ici,
   * une seule fois — aucune route ne permet de le relire.
   *
   * L'incrément de `token_version` périme les sessions en cours : sans lui, un
   * appareil resté connecté survivrait à la réinitialisation, qui ne fermerait
   * donc rien. Le drapeau force le changement à la prochaine connexion.
   */
  app.post('/users/:id/reset-password', adminOnly, async (req): Promise<ResetPasswordResult> => {
    const id = parseId(req.params)

    // L'admin connaît son mot de passe : il le change depuis ses réglages.
    // Se le réinitialiser reviendrait à se déconnecter de tous ses appareils
    // pour rien.
    if (id === req.currentUser.id) {
      throw app.httpErrors.badRequest('Change ton propre mot de passe depuis tes réglages')
    }

    const temporaryPassword = generateTemporaryPassword()

    const updated = await queryOne<{ id: number }>(
      `UPDATE users
          SET password_hash        = $2,
              must_change_password = TRUE,
              token_version        = token_version + 1
        WHERE id = $1
        RETURNING id`,
      [id, await hashPassword(temporaryPassword)],
    )
    if (!updated) throw app.httpErrors.notFound('Compte introuvable')

    req.log.info({ targetUserId: id, by: req.currentUser.id }, 'mot de passe réinitialisé')

    return { temporaryPassword }
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
