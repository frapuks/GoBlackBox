import type { FastifyPluginAsync } from 'fastify'
import { pushSubscriptionInput, type PushConfig } from '@blackbox/shared'
import { query } from '../db.js'
import { pushEnabled, vapidPublicKey } from '../push.js'

export const pushRoutes: FastifyPluginAsync = async (app) => {
  const auth = { preHandler: [app.requireAuth] }

  /**
   * La clé publique VAPID est nécessaire au navigateur pour s'abonner.
   * `enabled: false` quand le serveur n'a pas de clés : le front masque alors
   * l'interrupteur au lieu de proposer une fonctionnalité inopérante.
   */
  app.get('/push/config', auth, async (): Promise<PushConfig> => ({
    enabled: pushEnabled,
    publicKey: vapidPublicKey,
  }))

  app.post('/push/subscribe', auth, async (req) => {
    const body = pushSubscriptionInput.parse(req.body)

    // Le même appareil peut se réabonner : l'endpoint est unique, on met à jour
    // ses clés et son propriétaire plutôt que de créer un doublon.
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             p256dh  = EXCLUDED.p256dh,
             auth    = EXCLUDED.auth`,
      [req.currentUser.id, body.endpoint, body.keys.p256dh, body.keys.auth],
    )

    return { ok: true }
  })

  /** Couper l'interrupteur supprime l'abonnement : plus rien n'est envoyé. */
  app.post('/push/unsubscribe', auth, async (req) => {
    const { endpoint } = pushSubscriptionInput.pick({ endpoint: true }).parse(req.body)

    await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
      endpoint,
      req.currentUser.id,
    ])

    return { ok: true }
  })
}
