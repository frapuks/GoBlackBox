import { isCadenceLate, periodStart, reminderSlot, type RuleCadence } from '@blackbox/shared'
import { query } from './db.js'
import { notifyUsers, pushEnabled } from './push.js'

/**
 * Les rappels d'appliquer une cotisation ou une pénalité.
 *
 * Pas de tâche système ni de service en plus : l'API tourne en permanence sur
 * le Raspberry, une vérification par minute suffit et ne coûte rien. Une
 * requête sur deux règles au maximum, la table n'en contient pas d'autres avec
 * un rythme.
 *
 * ⚠ L'heure est celle du conteneur. Sans `TZ` dans docker-compose, il est à
 * Greenwich et un rappel de 19 h partirait à 21 h en été.
 */

type ReminderRow = {
  id: number
  kind: 'DUES' | 'PENALTY'
  label: string
  cadence: RuleCadence
  reminder_day: number
  reminder_hour: number
  reminder_minute: number | null
  last_applied_at: Date | null
  reminder_sent_at: Date | null
}

const DUE_SQL = `
  SELECT r.id, r.kind, r.label, r.cadence, r.reminder_day, r.reminder_hour,
         r.reminder_minute, r.reminder_sent_at,
         (SELECT MAX(f.created_at) FROM fines f WHERE f.rule_id = r.id) AS last_applied_at
    FROM rules r
   WHERE r.archived_at IS NULL
     AND r.kind <> 'FINE'
     AND r.cadence IS NOT NULL
     AND r.reminder_day IS NOT NULL
     AND r.reminder_hour IS NOT NULL`

/**
 * Un tour de vérification.
 *
 * Trois conditions pour envoyer, et elles se lisent dans cet ordre :
 *
 *  1. le créneau de la période en cours est PASSÉ. Pas « est exactement
 *     maintenant » : le Raspberry peut avoir été éteint à l'heure dite, et le
 *     rappel serait alors perdu pour de bon ;
 *  2. rien n'est encore parti pour cette période ;
 *  3. la règle est bien en retard — inutile de réclamer ce qui est déjà fait.
 */
export const runReminders = async (now = new Date()) => {
  if (!pushEnabled) return

  const rules = await query<ReminderRow>(DUE_SQL)

  for (const rule of rules) {
    const slot = reminderSlot(
      rule.cadence,
      rule.reminder_day,
      rule.reminder_hour,
      // NULL vaut l'heure pile : la colonne est arrivée après les autres.
      rule.reminder_minute ?? 0,
      now,
    )
    if (now < slot) continue

    const start = periodStart(rule.cadence, now)
    if (rule.reminder_sent_at && rule.reminder_sent_at >= start) continue

    const late = isCadenceLate(
      {
        kind: rule.kind,
        cadence: rule.cadence,
        lastAppliedAt: rule.last_applied_at ? rule.last_applied_at.toISOString() : null,
      },
      now,
    )
    if (!late) continue

    // La préférence du compte ET le rôle : la première s'éteint à la
    // rétrogradation, le second garantit qu'un ancien gestionnaire ne reçoit
    // rien quel que soit le chemin par lequel son rôle a changé.
    const column = rule.kind === 'DUES' ? 'notify_dues' : 'notify_penalty'
    const targets = await query<{ id: number }>(
      `SELECT id FROM users WHERE role IN ('ADMIN', 'MANAGER') AND ${column}`,
    )

    // La date d'envoi est posée même sans destinataire : sans ça, la requête
    // repartirait toutes les minutes jusqu'à la fin de la période.
    await query('UPDATE rules SET reminder_sent_at = NOW() WHERE id = $1', [rule.id])
    if (!targets.length) continue

    await notifyUsers(
      targets.map((t) => t.id),
      {
        title: rule.kind === 'DUES' ? 'Cotisation à appliquer' : 'Pénalités à appliquer',
        body: `${rule.label} n'a pas encore été appliquée`,
        url: '/rules',
      },
    )
  }
}

/** Toutes les minutes, plus un tour immédiat pour rattraper un créneau manqué. */
export const startReminders = (onError: (err: unknown) => void) => {
  const tick = () => void runReminders().catch(onError)
  tick()
  // `unref` : ce minuteur ne doit pas empêcher le processus de s'arrêter.
  return setInterval(tick, 60_000).unref()
}
