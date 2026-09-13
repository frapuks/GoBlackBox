import type { FastifyPluginAsync } from 'fastify'
import type { WeeklyDigest } from '@blackbox/shared'
import { queryOne } from '../db.js'

export const digestRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth, app.requireMember] }

  /**
   * Le dernier résumé publié, tel qu'il a été figé le lundi matin.
   *
   * Enveloppé plutôt que renvoyé nu : avant la toute première publication il
   * n'y a rien, et un corps `null` se distingue mal d'une réponse vide.
   */
  app.get('/digest', auth, async (): Promise<{ digest: WeeklyDigest | null }> => {
    const row = await queryOne<{ payload: WeeklyDigest }>(
      'SELECT payload FROM weekly_digest WHERE id = 1',
    )
    return { digest: row?.payload ?? null }
  })
}
