import type { FastifyPluginAsync } from 'fastify'
import {
  addDays,
  createMemberInput,
  updateMemberInput,
  updateRoleInput,
  type Dashboard,
  type MemberDetail,
  type MemberSummary,
  type PotHistory,
  type PotHistoryPoint,
  type ResetPasswordResult,
} from '@blackbox/shared'
import { generateTemporaryPassword, hashPassword } from '../auth.js'
import { buildProjection } from '../forecast.js'
import { query, queryOne } from '../db.js'
import {
  FINE_SQL,
  MEMBER_SUMMARY_SQL,
  MEMBER_TOTAL_SQL,
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

  /** Écran Classement : totaux de la caisse + membres triés par total d'amendes. */
  app.get('/dashboard', auth, async (): Promise<Dashboard> => {
    const rows = await query<MemberSummaryRow>(
      // Classement au total des amendes reçues, payées comprises : c'est le
      // palmarès de la saison, pas la liste des mauvais payeurs. Régler sa
      // dette ne fait donc plus reculer dans le classement.
      `${MEMBER_SUMMARY_SQL} ORDER BY ${MEMBER_TOTAL_SQL} DESC, m.display_name`,
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

  /**
   * Évolution de la cagnotte, pour le graphique du Classement.
   *
   * Un point par jour où une amende a été validée — entre deux, la courbe est
   * plate par construction. Sur une saison, quelques centaines de lignes.
   *
   * Le cumul est fait en SQL : une fenêtre sur des totaux journaliers déjà
   * agrégés, donc une seule passe. Et `to_char` plutôt qu'une date renvoyée au
   * driver, qui la transformerait en objet Date et exposerait au décalage de
   * fuseau — cette colonne ne porte qu'un jour civil.
   */
  app.get('/dashboard/history', auth, async (): Promise<PotHistory> => {
    const points = await query<PotHistoryPoint>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day,
              SUM(amount) OVER (ORDER BY day)::int AS total
         FROM (
           SELECT (created_at AT TIME ZONE 'Europe/Paris')::date AS day,
                  SUM(amount)                                    AS amount
             FROM fines
            WHERE status = 'CONFIRMED'
            GROUP BY 1
         ) parjour
        ORDER BY day`,
    )

    // Les entrées de la prévision, en une passe. `dues_amount` × `payers`
    // reproduit exactement ce que crée une application de cotisation — même
    // effectif ciblé, mêmes règles actives —, donc la prévision ne peut pas
    // annoncer un montant que le bouton « Appliquer » ne produirait pas.
    const inputs = await queryOne<{
      end_date: string | null
      fines_total: number
      dues_amount: number
      payers: number
      today: string
    }>(
      `SELECT to_char(s.end_date, 'YYYY-MM-DD') AS end_date,
              to_char((NOW() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS today,
              (SELECT COALESCE(SUM(f.amount), 0)::int
                 FROM fines f
                 LEFT JOIN rules r ON r.id = f.rule_id
                WHERE f.status = 'CONFIRMED'
                  AND (r.kind IS NULL OR r.kind <> 'DUES'))          AS fines_total,
              (SELECT COALESCE(SUM(r.amount), 0)::int
                 FROM rules r
                WHERE r.kind = 'DUES' AND r.archived_at IS NULL
                  AND s.enable_dues)                                 AS dues_amount,
              (SELECT COUNT(*)::int FROM members WHERE receives_fines) AS payers
         FROM settings s
        WHERE s.id = 1`,
    )

    // La cagnotte part de ZÉRO, et la courbe doit le montrer : sans ce point
    // d'ancrage elle démarre au montant du premier jour, ce qui laisse croire
    // que l'argent était déjà là.
    //
    // C'est aussi ce qui permet d'afficher une évolution dès le premier jour
    // d'usage : une équipe qui saisit toute sa saison en une soirée n'a qu'un
    // seul jour actif, donc un point isolé, et le graphique restait masqué.
    //
    // Ajouté APRÈS le calcul de la prévision : ce jour sans amende ne doit
    // compter ni dans les jours actifs, ni dans la durée d'observation du
    // rythme, sous peine de fausser les deux.
    const series = points.length
      ? [{ day: addDays(points[0]!.day, -1), total: 0 }, ...points]
      : points

    return {
      points: series,
      projection: buildProjection({
        // Le jour vient de PostgreSQL, en Europe/Paris : l'horloge du serveur
        // et celle des amendes doivent être la même, sinon la prévision décale
        // d'un jour selon le fuseau du conteneur.
        today: inputs!.today,
        endDate: inputs!.end_date,
        points,
        finesTotal: inputs!.fines_total,
        duesPerApplication: inputs!.dues_amount * inputs!.payers,
      }),
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
   * Supprime un participant — uniquement s'il ne laisse rien derrière lui.
   *
   * Sert à retirer quelqu'un ajouté par erreur, ou qui n'a jamais joué. Deux
   * refus, pour deux raisons différentes :
   *
   *  - **un compte rattaché** : le supprimer renverrait la personne vers
   *    « Qui es-tu ? » à sa prochaine ouverture, sans qu'elle comprenne. Il
   *    faut détacher d'abord, geste qui existe déjà et qui est réversible.
   *  - **au moins une amende** : `fines.member_id` est en CASCADE, la
   *    suppression emporterait tout son historique. L'argent déjà encaissé
   *    sortirait de la cagnotte, qui cesserait de correspondre à la boîte.
   *    Pour un joueur parti, c'est « Concerné par les amendes » qu'on coupe.
   */
  app.delete('/members/:id', adminOnly, async (req, reply) => {
    const id = parseId(req.params)

    // Conditions dans le WHERE plutôt qu'en test préalable : aucune fenêtre
    // pendant laquelle une amende pourrait arriver entre les deux.
    const deleted = await queryOne<{ id: number }>(
      `DELETE FROM members
        WHERE id = $1
          AND user_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM fines f WHERE f.member_id = members.id)
        RETURNING id`,
      [id],
    )
    if (deleted) return reply.code(204).send()

    // Rien supprimé : on relit pour dire POURQUOI. Un message générique
    // laisserait l'admin sans la marche à suivre.
    const row = await queryOne<{ user_id: number | null; fines: number }>(
      `SELECT user_id,
              (SELECT COUNT(*)::int FROM fines f WHERE f.member_id = m.id) AS fines
         FROM members m WHERE id = $1`,
      [id],
    )
    if (!row) throw app.httpErrors.notFound('Participant introuvable')
    if (row.user_id !== null) {
      throw app.httpErrors.badRequest('Détache d’abord le compte rattaché')
    }
    throw app.httpErrors.badRequest(
      'Ce participant a des amendes : coupe « Concerné par les amendes » plutôt que de le supprimer',
    )
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
