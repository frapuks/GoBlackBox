import type { FastifyPluginAsync } from 'fastify'
import {
  updateFeaturesInput,
  updateMeInput,
  updateSettingsInput,
  type Me,
  type Settings,
} from '@blackbox/shared'
import { generateInviteCode, hashPassword, verifyPassword } from '../auth.js'
import { queryOne, transaction } from '../db.js'

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }
  const staff = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN', 'MANAGER')],
  }
  const adminOnly = {
    preHandler: [app.requireAuth, app.requireMember, app.requireRole('ADMIN')],
  }

  /**
   * Lisible par tous — le délai de retard doit être visible sur l'écran Règles.
   * Mais inviteCode n'est ajouté que pour l'ADMIN : il ne doit jamais partir
   * dans une réponse lue par un joueur.
   */
  type SettingsRow = {
    late_after_days: number
    allow_player_reports: boolean
    enable_penalties: boolean
    enable_dues: boolean
    invite_code: string
  }

  app.get('/settings', auth, async (req): Promise<Settings> => {
    const row = await queryOne<SettingsRow>(
      'SELECT late_after_days, allow_player_reports, enable_penalties, enable_dues, invite_code FROM settings WHERE id = 1',
    )

    const base: Settings = {
      lateAfterDays: row!.late_after_days,
      allowPlayerReports: row!.allow_player_reports,
      enablePenalties: row!.enable_penalties,
      enableDues: row!.enable_dues,
    }

    // Les gestionnaires distribuent le code au même titre que l'admin.
    // Un joueur ne le voit jamais.
    const isStaff = req.currentUser.role === 'ADMIN' || req.currentUser.role === 'MANAGER'
    return isStaff ? { ...base, inviteCode: row!.invite_code } : base
  })

  const RETURNING =
    'RETURNING late_after_days, allow_player_reports, enable_penalties, enable_dues, invite_code'

  const toSettings = (row: SettingsRow): Settings => ({
    lateAfterDays: row.late_after_days,
    allowPlayerReports: row.allow_player_reports,
    enablePenalties: row.enable_penalties,
    enableDues: row.enable_dues,
    inviteCode: row.invite_code,
  })

  /** Réglage du quotidien : un gestionnaire ajuste le délai comme il ajuste les règles. */
  app.patch('/settings', staff, async (req): Promise<Settings> => {
    const body = updateSettingsInput.parse(req.body)

    const row = await queryOne<SettingsRow>(
      `UPDATE settings SET late_after_days = COALESCE($1, late_after_days)
        WHERE id = 1 ${RETURNING}`,
      [body.lateAfterDays ?? null],
    )

    // Changer lateAfterDays reclasse instantanément tout l'historique,
    // puisque le retard est calculé à la volée. C'est voulu.
    return toSettings(row!)
  })

  /**
   * Fonctionnalités de la caisse. Couper les pénalités éteint aussi toute la
   * notion de retard — badges compris — puisque le calcul dépend du réglage.
   */
  app.patch('/settings/features', adminOnly, async (req): Promise<Settings> => {
    const body = updateFeaturesInput.parse(req.body)

    const row = await queryOne<SettingsRow>(
      `UPDATE settings
          SET allow_player_reports = COALESCE($1, allow_player_reports),
              enable_penalties     = COALESCE($2, enable_penalties),
              enable_dues          = COALESCE($3, enable_dues)
        WHERE id = 1 ${RETURNING}`,
      [
        body.allowPlayerReports ?? null,
        body.enablePenalties ?? null,
        body.enableDues ?? null,
      ],
    )

    return toSettings(row!)
  })

  /**
   * Renouveler le code invalide les invitations déjà distribuées : c'est de
   * l'administration, pas du quotidien. Un gestionnaire le lit et le partage,
   * mais ne le remplace pas.
   */
  app.post('/settings/invite-code', adminOnly, async (): Promise<Settings> => {
    const row = await queryOne<SettingsRow>(
      `UPDATE settings SET invite_code = $1 WHERE id = 1 ${RETURNING}`,
      [generateInviteCode()],
    )

    return toSettings(row!)
  })

  // Volontairement sans `requireMember`, contrairement au reste : un compte
  // réinitialisé avant d'avoir réclamé son nom est bloqué sur l'écran de
  // changement de mot de passe, et c'est cette route qui l'en sort.
  app.patch('/me', { preHandler: [app.requireAuth] }, async (req): Promise<Me> => {
    const body = updateMeInput.parse(req.body)
    const userId = req.currentUser.id

    if (body.newPassword && !body.currentPassword) {
      throw app.httpErrors.badRequest('Mot de passe actuel requis')
    }

    await transaction(async (client) => {
      if (body.newPassword) {
        const { rows } = await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM users WHERE id = $1',
          [userId],
        )
        if (!(await verifyPassword(body.currentPassword!, rows[0]!.password_hash))) {
          throw app.httpErrors.forbidden('Mot de passe actuel incorrect')
        }
        // Le drapeau retombe ici, et nulle part ailleurs : c'est le seul geste
        // qui prouve que le mot de passe temporaire a bien été remplacé.
        // `token_version` n'est PAS incrémenté — l'utilisateur changerait son
        // mot de passe et se déconnecterait lui-même dans la foulée.
        await client.query(
          `UPDATE users
              SET password_hash = $2, must_change_password = FALSE
            WHERE id = $1`,
          [userId, await hashPassword(body.newPassword)],
        )
      }

      if (body.displayName !== undefined) {
        await client.query('UPDATE members SET display_name = $2 WHERE user_id = $1', [
          userId,
          body.displayName,
        ])
      }
    })

    const row = await queryOne<{
      id: number
      email: string
      role: Me['user']['role']
      must_change_password: boolean
      member_id: number | null
      display_name: string | null
    }>(
      `SELECT u.id, u.email, u.role, u.must_change_password,
              m.id AS member_id, m.display_name
         FROM users u
         LEFT JOIN members m ON m.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    )

    return {
      user: {
        id: row!.id,
        email: row!.email,
        role: row!.role,
        mustChangePassword: row!.must_change_password,
      },
      member: row!.member_id ? { id: row!.member_id, displayName: row!.display_name! } : null,
    }
  })
}
