import type { FastifyPluginAsync } from 'fastify'
import type { WeeklyDigest } from '@blackbox/shared'
import { queryOne } from '../db.js'
import { loadFeatures, type Features } from '../features.js'

/**
 * Libellés des distinctions de classement, pour les résumés publiés avant que
 * `source` n'existe. Ils ne servent qu'à ce repli : un résumé est remplacé
 * chaque lundi, le dernier ancien aura donc disparu une semaine après la mise
 * à jour.
 */
const LEGACY_RANK_LABELS = ['Premier au classement', 'Dernier au classement']

/**
 * Retire du résumé ce que les interrupteurs coupent.
 *
 * À la lecture et non à la production : le résumé est figé le lundi, et un
 * interrupteur basculé dans la semaine doit s'appliquer tout de suite. Une
 * rubrique vide disparaît d'elle-même de l'affichage.
 */
const applyFeatures = (digest: WeeklyDigest, features: Features): WeeklyDigest => ({
  ...digest,
  badgeChanges: !features.enableBadges
    ? []
    : features.enableLeaderboard
      ? digest.badgeChanges
      : digest.badgeChanges.filter((b) =>
          b.source
            ? b.source !== 'FIRST' && b.source !== 'LAST'
            : !LEGACY_RANK_LABELS.includes(b.label),
        ),
  rankMoves: features.enableLeaderboard ? digest.rankMoves : [],
  penalties: features.enablePenalties ? digest.penalties : [],
  dues: features.enableDues ? digest.dues : null,
})

export const digestRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }

  /**
   * Le dernier résumé publié, tel qu'il a été figé le lundi matin.
   *
   * Enveloppé plutôt que renvoyé nu : avant la toute première publication il
   * n'y a rien, et un corps `null` se distingue mal d'une réponse vide.
   *
   * Récap coupé : `null`, comme avant la première publication. Il continue
   * d'être produit chaque lundi, pour qu'une réactivation montre la semaine
   * écoulée et non un résumé périmé.
   */
  app.get('/digest', auth, async (): Promise<{ digest: WeeklyDigest | null }> => {
    const features = await loadFeatures()
    if (!features.enableDigest) return { digest: null }

    const row = await queryOne<{ payload: WeeklyDigest }>(
      'SELECT payload FROM weekly_digest WHERE id = 1',
    )
    return { digest: row ? applyFeatures(row.payload, features) : null }
  })
}
