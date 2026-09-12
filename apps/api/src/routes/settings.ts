import type { FastifyPluginAsync } from 'fastify'
import {
  updateFeaturesInput,
  updateBadgesInput,
  updateMeInput,
  updateNotificationsInput,
  updateSettingsInput,
  type Me,
  type BadgeImage,
  type Settings,
} from '@blackbox/shared'
import { generateInviteCode, hashPassword, verifyPassword } from '../auth.js'
import { loadMe } from './auth.js'
import { query, queryOne, transaction } from '../db.js'

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
    first_badge_icon: BadgeImage | null
    last_badge_icon: BadgeImage | null
    first_fine_badge_icon: BadgeImage | null
    invite_code: string
    // `DATE` en base : le driver pg en fait un objet Date à minuit local. On
    // ne le convertit jamais en ISO complet, ce qui décalerait d'un jour selon
    // le fuseau — la colonne ne porte qu'une date civile.
    end_date: Date | null
    usage_start_date: Date | null
    usage_end_date: Date | null
  }

  const COLUMNS =
    'late_after_days, allow_player_reports, enable_penalties, enable_dues, invite_code, ' +
    'first_badge_icon, last_badge_icon, first_fine_badge_icon, ' +
    'end_date, usage_start_date, usage_end_date'

  /** « 2027-05-31 », dans le fuseau local — jamais toISOString(). */
  const toDay = (d: Date | null): string | null =>
    d === null
      ? null
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate(),
        ).padStart(2, '0')}`

  app.get('/settings', auth, async (req): Promise<Settings> => {
    const row = await queryOne<SettingsRow>(`SELECT ${COLUMNS} FROM settings WHERE id = 1`)

    const base: Settings = {
      lateAfterDays: row!.late_after_days,
      allowPlayerReports: row!.allow_player_reports,
      enablePenalties: row!.enable_penalties,
      enableDues: row!.enable_dues,
      firstBadgeIcon: row!.first_badge_icon,
      lastBadgeIcon: row!.last_badge_icon,
      firstFineBadgeIcon: row!.first_fine_badge_icon,
      endDate: toDay(row!.end_date),
      usageStartDate: toDay(row!.usage_start_date),
      usageEndDate: toDay(row!.usage_end_date),
    }

    // Les gestionnaires distribuent le code au même titre que l'admin.
    // Un joueur ne le voit jamais.
    const isStaff = req.currentUser.role === 'ADMIN' || req.currentUser.role === 'MANAGER'
    return isStaff ? { ...base, inviteCode: row!.invite_code } : base
  })

  const RETURNING = `RETURNING ${COLUMNS}`

  const toSettings = (row: SettingsRow): Settings => ({
    lateAfterDays: row.late_after_days,
    allowPlayerReports: row.allow_player_reports,
    enablePenalties: row.enable_penalties,
    enableDues: row.enable_dues,
    firstBadgeIcon: row.first_badge_icon,
    lastBadgeIcon: row.last_badge_icon,
    firstFineBadgeIcon: row.first_fine_badge_icon,
    inviteCode: row.invite_code,
    endDate: toDay(row.end_date),
    usageStartDate: toDay(row.usage_start_date),
    usageEndDate: toDay(row.usage_end_date),
  })

  /**
   * Réglages du quotidien : un gestionnaire ajuste le délai et les dates comme
   * il ajuste les règles.
   *
   * Les dates sont purement indicatives — aucune ne ferme la caisse ni ne
   * bloque quoi que ce soit.
   */
  app.patch('/settings', staff, async (req): Promise<Settings> => {
    const body = updateSettingsInput.parse(req.body)

    // La cohérence de la plage porte sur l'état APRÈS fusion : envoyer une
    // seule des deux dates est légitime, encore faut-il valider le résultat et
    // non le fragment reçu. La table ne fait qu'une ligne, la lecture est
    // gratuite — et le message reste lisible, là où la contrainte SQL
    // remonterait une erreur de base brute.
    const current = await queryOne<SettingsRow>(`SELECT ${COLUMNS} FROM settings WHERE id = 1`)
    const pick = <K extends 'endDate' | 'usageStartDate' | 'usageEndDate'>(
      key: K,
      fallback: Date | null,
    ) => (body[key] === undefined ? toDay(fallback) : body[key]!)

    const usageStart = pick('usageStartDate', current!.usage_start_date)
    const usageEnd = pick('usageEndDate', current!.usage_end_date)

    if (usageEnd !== null) {
      if (usageStart === null) {
        throw app.httpErrors.badRequest(
          'Une fin d’utilisation exige une date de début',
        )
      }
      if (usageEnd < usageStart) {
        throw app.httpErrors.badRequest('La fin d’utilisation doit suivre le début')
      }
    }

    const row = await queryOne<SettingsRow>(
      `UPDATE settings
          SET late_after_days  = COALESCE($1, late_after_days),
              end_date         = CASE WHEN $2::boolean THEN $3::date ELSE end_date END,
              usage_start_date = CASE WHEN $4::boolean THEN $5::date ELSE usage_start_date END,
              usage_end_date   = CASE WHEN $6::boolean THEN $7::date ELSE usage_end_date END
        WHERE id = 1 ${RETURNING}`,
      [
        body.lateAfterDays ?? null,
        // COALESCE ne suffit pas pour les dates : il confondrait « efface » et
        // « ne touche pas », qui arrivent tous deux en NULL.
        body.endDate !== undefined,
        body.endDate ?? null,
        body.usageStartDate !== undefined,
        body.usageStartDate ?? null,
        body.usageEndDate !== undefined,
        body.usageEndDate ?? null,
      ],
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
   * Icônes des deux distinctions du classement.
   *
   * Route à part plutôt qu'ajoutée aux fonctionnalités : celles-ci sont des
   * interrupteurs qui allument ou éteignent des pans entiers de l'app, ceux-ci
   * ne changent qu'un dessin. Les confondre rendrait la première illisible.
   *
   * `null` retire le badge — la façon la plus simple d'éteindre une distinction
   * sans ajouter un interrupteur de plus.
   */
  app.patch('/settings/badges', adminOnly, async (req): Promise<Settings> => {
    const body = updateBadgesInput.parse(req.body)

    const row = await queryOne<SettingsRow>(
      // Booléen de présence, comme pour les dates : « retirer l'icône » et
      // « ne pas y toucher » arrivent tous deux en NULL.
      `UPDATE settings
          SET first_badge_icon      = CASE WHEN $1::boolean THEN $2 ELSE first_badge_icon END,
              last_badge_icon       = CASE WHEN $3::boolean THEN $4 ELSE last_badge_icon END,
              first_fine_badge_icon =
                CASE WHEN $5::boolean THEN $6 ELSE first_fine_badge_icon END
        WHERE id = 1 ${RETURNING}`,
      [
        body.firstBadgeIcon !== undefined,
        body.firstBadgeIcon ?? null,
        body.lastBadgeIcon !== undefined,
        body.lastBadgeIcon ?? null,
        body.firstFineBadgeIcon !== undefined,
        body.firstFineBadgeIcon ?? null,
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

    return loadMe(userId)
  })

  /**
   * Ce que ce compte veut recevoir.
   *
   * Sur le compte et non sur l'appareil : l'abonnement push dit qu'un
   * navigateur PEUT recevoir, ces trois drapeaux disent ce qu'on VEUT recevoir,
   * et ça suit la personne d'un téléphone à l'autre.
   *
   * Sans `requireRole` : un joueur peut très bien envoyer `penalty`, la colonne
   * le retiendra sans rien changer pour lui puisque l'envoi filtre sur le rôle.
   * Un 403 n'apprendrait rien de plus et casserait l'écran pour un réglage que
   * le front ne lui affiche même pas.
   */
  app.patch('/me/notifications', { preHandler: [app.requireAuth] }, async (req): Promise<Me> => {
    const body = updateNotificationsInput.parse(req.body)

    await query(
      `UPDATE users
          SET notify_fines   = COALESCE($2, notify_fines),
              notify_penalty = COALESCE($3, notify_penalty),
              notify_dues    = COALESCE($4, notify_dues),
              notify_reports = COALESCE($5, notify_reports)
        WHERE id = $1`,
      [
        req.currentUser.id,
        body.fines ?? null,
        body.penalty ?? null,
        body.dues ?? null,
        body.reports ?? null,
      ],
    )

    return loadMe(req.currentUser.id)
  })
}
