import { isDuesLate, isPenaltyLate, periodStart } from '@blackbox/shared'
import { query, queryOne } from './db.js'
import { IS_PENALIZABLE_SQL } from './queries.js'
import { notifyUsers, pushEnabled } from './push.js'

/**
 * Les rappels d'appliquer une cotisation ou une pénalité.
 *
 * Deux mécanismes distincts :
 *  - la cotisation réclame le 1er de chaque mois à 9 h, si elle n'a pas encore
 *    été appliquée ce mois-ci ;
 *  - la pénalité réclame quand son statut « en retard » APPARAÎT, le délai de
 *    retard étant écoulé depuis sa dernière application.
 *
 * Pas de tâche système ni de service en plus : l'API tourne en permanence sur
 * le Raspberry, une vérification par minute suffit et ne coûte rien.
 *
 * ⚠ L'heure est celle du conteneur. Sans `TZ` dans docker-compose, il est à
 * Greenwich et un rappel de 9 h partirait à 11 h en été.
 */

/** Heure des rappels : le matin, jamais au milieu de la nuit. */
const REMINDER_HOUR = 9

/**
 * Un tour de vérification : la cotisation, puis la pénalité.
 */
export const runReminders = async (now = new Date()) => {
  if (!pushEnabled) return
  await runDuesReminder(now)
  await runPenaltyReminder(now)
}

/**
 * Le rappel de la cotisation, toujours mensuelle.
 *
 * Trois conditions, dans cet ordre :
 *  1. on a passé le 1er du mois à 9 h. « Passé » et non « exactement » : si le
 *     Raspberry était éteint à l'heure dite, le rappel sort au redémarrage,
 *     tant qu'on est dans le même mois ;
 *  2. rien n'est encore parti ce mois-ci ;
 *  3. la cotisation n'a pas été appliquée ce mois-ci — inutile de réclamer ce
 *     qui est déjà fait.
 */
const runDuesReminder = async (now: Date) => {
  const monthStart = periodStart('MONTH', now)
  const slot = new Date(monthStart)
  slot.setHours(REMINDER_HOUR, 0, 0, 0)
  if (now < slot) return

  const rule = await queryOne<{
    id: number
    label: string
    reminder_sent_at: Date | null
    last_applied_at: Date | null
  }>(
    `SELECT r.id, r.label, r.reminder_sent_at,
            (SELECT MAX(f.created_at) FROM fines f WHERE f.rule_id = r.id) AS last_applied_at
       FROM rules r
       CROSS JOIN settings s
      WHERE r.kind = 'DUES' AND r.archived_at IS NULL
      LIMIT 1`,
  )
  if (!rule) return
  if (rule.reminder_sent_at && rule.reminder_sent_at >= monthStart) return

  const late = isDuesLate(
    {
      kind: 'DUES',
      lastAppliedAt: rule.last_applied_at ? rule.last_applied_at.toISOString() : null,
    },
    now,
  )
  if (!late) return

  // Posée même sans destinataire : sans ça, la vérification repartirait chaque
  // minute jusqu'à la fin du mois. L'heure du TOUR et non celle de la base :
  // les deux coïncident en service, mais un tour rejoué à une autre date doit
  // se comparer à sa propre date.
  await query('UPDATE rules SET reminder_sent_at = $2 WHERE id = $1', [rule.id, now])

  const targets = await managersWanting('notify_dues')
  if (!targets.length) return

  await notifyUsers(
    targets.map((t) => t.id),
    {
      title: 'Cotisation à appliquer',
      body: `${rule.label} n'a pas encore été appliquée ce mois-ci`,
      url: '/rules',
    },
  )
}

/**
 * Les gestionnaires qui veulent ce rappel.
 *
 * La préférence du compte ET le rôle : la première s'éteint à la
 * rétrogradation, le second garantit qu'un ancien gestionnaire ne reçoit rien
 * quel que soit le chemin par lequel son rôle a changé.
 */
const managersWanting = (column: 'notify_dues' | 'notify_penalty') =>
  query<{ id: number }>(`SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND ${column}`)

/**
 * Le rappel de la pénalité de retard, lié à l'apparition de son statut « en
 * retard » : même condition exactement, calculée par la même fonction que
 * l'écran Règles.
 *
 * Un seul rappel par apparition du statut. Il repart à la prochaine, c'est-à-dire
 * après une application suivie d'un nouveau délai écoulé : la date d'envoi est
 * alors antérieure au moment où le statut est réapparu.
 */
const runPenaltyReminder = async (now: Date) => {
  const rule = await queryOne<{
    id: number
    label: string
    reminder_sent_at: Date | null
    last_applied_at: Date | null
    late_after_days: number
    has_targets: boolean
  }>(
    `SELECT r.id, r.label, r.reminder_sent_at, s.late_after_days,
            (SELECT MAX(f.created_at) FROM fines f WHERE f.rule_id = r.id) AS last_applied_at,
            EXISTS (
              SELECT 1 FROM fines f
                JOIN members m ON m.id = f.member_id
               WHERE m.receives_fines AND ${IS_PENALIZABLE_SQL}
            ) AS has_targets
       FROM rules r
       CROSS JOIN settings s
      WHERE r.kind = 'PENALTY' AND r.archived_at IS NULL
      LIMIT 1`,
  )
  if (!rule || now.getHours() < REMINDER_HOUR) return

  const late = isPenaltyLate(
    {
      kind: 'PENALTY',
      lastAppliedAt: rule.last_applied_at ? rule.last_applied_at.toISOString() : null,
    },
    rule.late_after_days,
    rule.has_targets,
    now,
  )
  if (!late) return

  // Le moment où le statut est apparu, à l'heure près comme le délai lui-même.
  // Jamais appliquée : dès l'origine, donc un seul rappel tant que personne ne
  // clique.
  const lateSince = rule.last_applied_at
    ? new Date(rule.last_applied_at.getTime() + rule.late_after_days * 86_400_000)
    : null
  const alreadySent =
    rule.reminder_sent_at !== null && (lateSince === null || rule.reminder_sent_at >= lateSince)
  if (alreadySent) return

  // Posée même sans destinataire : sans ça, la vérification repartirait chaque
  // minute tant que le statut dure.
  await query('UPDATE rules SET reminder_sent_at = $2 WHERE id = $1', [rule.id, now])

  const targets = await managersWanting('notify_penalty')
  if (!targets.length) return

  await notifyUsers(
    targets.map((t) => t.id),
    {
      title: 'Pénalités à appliquer',
      body: 'Des amendes en retard attendent leur majoration',
      url: '/rules',
    },
  )
}

/** Toutes les minutes, plus un tour immédiat pour rattraper un créneau manqué. */
export const startReminders = (onError: (err: unknown) => void) => {
  const tick = () => void runReminders().catch(onError)
  tick()
  // `unref` : ce minuteur ne doit pas empêcher le processus de s'arrêter.
  return setInterval(tick, 60_000).unref()
}
