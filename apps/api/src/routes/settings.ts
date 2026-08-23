import type { FastifyPluginAsync } from 'fastify'
import { updateMeInput, updateSettingsInput, type Me, type Settings } from '@blackbox/shared'
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
    invite_code: string
  }

  app.get('/settings', auth, async (req): Promise<Settings> => {
    const row = await queryOne<SettingsRow>(
      'SELECT late_after_days, allow_player_reports, invite_code FROM settings WHERE id = 1',
    )

    const base: Settings = {
      lateAfterDays: row!.late_after_days,
      allowPlayerReports: row!.allow_player_reports,
    }

    // Les gestionnaires distribuent le code au même titre que l'admin.
    // Un joueur ne le voit jamais.
    const isStaff = req.currentUser.role === 'ADMIN' || req.currentUser.role === 'MANAGER'
    return isStaff ? { ...base, inviteCode: row!.invite_code } : base
  })

  /**
   * Deux champs de sensibilité différente sur la même route :
   *  - `lateAfterDays` relève du quotidien, un gestionnaire l'ajuste ;
   *  - `allowPlayerReports` ouvre une fonctionnalité à toute l'équipe, c'est
   *    une décision d'administrateur.
   *
   * D'où un contrôle par CHAMP plutôt qu'un `preHandler` : le second serait
   * soit trop permissif, soit trop restrictif.
   */
  app.patch('/settings', staff, async (req): Promise<Settings> => {
    const body = updateSettingsInput.parse(req.body)

    if (body.allowPlayerReports !== undefined && req.currentUser.role !== 'ADMIN') {
      throw app.httpErrors.forbidden("Les signalements relèvent de l'administrateur")
    }

    const row = await queryOne<SettingsRow>(
      `UPDATE settings
          SET late_after_days      = COALESCE($1, late_after_days),
              allow_player_reports = COALESCE($2, allow_player_reports)
        WHERE id = 1
        RETURNING late_after_days, allow_player_reports, invite_code`,
      [body.lateAfterDays ?? null, body.allowPlayerReports ?? null],
    )

    // Changer lateAfterDays reclasse instantanément tout l'historique,
    // puisque le retard est calculé à la volée. C'est voulu.
    return {
      lateAfterDays: row!.late_after_days,
      allowPlayerReports: row!.allow_player_reports,
      inviteCode: row!.invite_code,
    }
  })

  /**
   * Renouveler le code invalide les invitations déjà distribuées : c'est de
   * l'administration, pas du quotidien. Un gestionnaire le lit et le partage,
   * mais ne le remplace pas.
   */
  app.post('/settings/invite-code', adminOnly, async (): Promise<Settings> => {
    const row = await queryOne<SettingsRow>(
      `UPDATE settings SET invite_code = $1 WHERE id = 1
        RETURNING late_after_days, allow_player_reports, invite_code`,
      [generateInviteCode()],
    )

    return {
      lateAfterDays: row!.late_after_days,
      allowPlayerReports: row!.allow_player_reports,
      inviteCode: row!.invite_code,
    }
  })

  app.patch('/me', auth, async (req): Promise<Me> => {
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
        await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
          userId,
          await hashPassword(body.newPassword),
        ])
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
      member_id: number
      display_name: string
    }>(
      `SELECT u.id, u.email, u.role, m.id AS member_id, m.display_name
         FROM users u
         JOIN members m ON m.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    )

    return {
      user: { id: row!.id, email: row!.email, role: row!.role },
      member: { id: row!.member_id, displayName: row!.display_name },
    }
  })
}
