import webpush from 'web-push'
import { query } from './db.js'

/**
 * Notifications push (Web Push, protocole standard).
 *
 * Le Pi envoie directement aux serveurs de push d'Apple et Google, sans service
 * tiers. Les clés VAPID l'identifient auprès d'eux : les changer invalide tous
 * les abonnements existants.
 *
 * Sans clés configurées, tout est désactivé proprement — l'app fonctionne, elle
 * ne propose simplement pas les notifications.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@blackbox.local'

export const pushEnabled = Boolean(publicKey && privateKey)
export const vapidPublicKey = publicKey ?? null

if (pushEnabled) webpush.setVapidDetails(subject, publicKey!, privateKey!)

type SubscriptionRow = {
  id: number
  endpoint: string
  p256dh: string
  auth: string
}

export type PushPayload = {
  title: string
  body: string
  /** Chemin ouvert au clic sur la notification. */
  url: string
}

/**
 * Envoie une notification à tous les appareils d'un ensemble de comptes.
 *
 * Ne lève jamais : une notification perdue ne doit pas faire échouer l'action
 * métier qui l'a déclenchée. Un abonnement mort (404/410) est supprimé — c'est
 * le seul signal qu'un appareil a désinstallé l'app ou révoqué la permission.
 */
export const notifyUsers = async (userIds: number[], payload: PushPayload) => {
  if (!pushEnabled || userIds.length === 0) return

  const subs = await query<SubscriptionRow>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::int[])',
    [[...new Set(userIds)]],
  )
  if (!subs.length) return

  const body = JSON.stringify(payload)
  const dead: number[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }),
  )

  if (dead.length) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1::int[])', [dead])
  } else {
    await query('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ANY($1::int[])', [
      subs.map((s) => s.id),
    ])
  }
}

/**
 * Notifie les joueurs concernés par un lot d'amendes fraîchement créé.
 *
 * Un participant sans compte n'a pas d'utilisateur, donc pas d'appareil : la
 * jointure l'écarte naturellement.
 */
export const notifyNewFines = async (fineIds: number[]) => {
  if (!pushEnabled || fineIds.length === 0) return

  const rows = await query<{ user_id: number; label: string; amount: number }>(
    `SELECT m.user_id, f.label, f.amount
       FROM fines f
       JOIN members m ON m.id = f.member_id
       -- La préférence du COMPTE, pas celle de l'appareil : couper les amendes
       -- sur un téléphone les coupe partout, c'est un choix de personne.
       JOIN users u ON u.id = m.user_id AND u.notify_fines
      WHERE f.id = ANY($1::int[]) AND m.user_id IS NOT NULL`,
    [fineIds],
  )

  // Un joueur qui reçoit plusieurs amendes d'un coup ne doit pas recevoir
  // plusieurs notifications empilées.
  const byUser = new Map<number, { label: string; amount: number }[]>()
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? []
    list.push({ label: r.label, amount: r.amount })
    byUser.set(r.user_id, list)
  }

  await Promise.all(
    [...byUser.entries()].map(([userId, fines]) => {
      const total = fines.reduce((sum, f) => sum + f.amount, 0)
      const body =
        fines.length === 1
          ? `${fines[0]!.label} · ${fines[0]!.amount} €`
          : `${fines.length} amendes · ${total} €`

      return notifyUsers([userId], { title: 'Nouvelle amende', body, url: '/' })
    }),
  )
}

/**
 * Prévient les gestionnaires qu'un joueur vient de signaler des amendes.
 *
 * Le rôle est vérifié ICI, en plus de la préférence : celle-ci s'éteint à la
 * rétrogradation, mais une seule ligne de code en répond. Le filtre sur le rôle
 * garantit qu'un ancien gestionnaire ne reçoit rien, quel que soit le chemin
 * par lequel son rôle a changé.
 *
 * L'auteur est écarté : il vient de saisir, il sait.
 */
export const notifyNewReports = async (count: number, authorUserId: number | null) => {
  if (!pushEnabled || count === 0) return

  const rows = await query<{ id: number }>(
    `SELECT id FROM users
      WHERE role IN ('ADMIN', 'MANAGER')
        AND notify_reports
        AND id <> COALESCE($1, 0)`,
    [authorUserId],
  )
  if (!rows.length) return

  await notifyUsers(rows.map((r) => r.id), {
    title: 'Signalement à valider',
    body: count === 1 ? 'Une amende attend ta validation' : count + ' amendes attendent ta validation',
    url: '/fines',
  })
}
