import {
  periodStart,
  rankedMembers,
  type MemberBadge,
  type WeeklyDigest,
} from '@blackbox/shared'
import { loadBadges, type RankInput } from './badges.js'
import { query, queryOne } from './db.js'

/**
 * Le résumé de la semaine écoulée.
 *
 * Produit le lundi à 8 h pour la semaine du lundi 0 h au dimanche 23 h 59, puis
 * enregistré tel quel. Les huit heures de marge laissent passer les saisies
 * tardives du dimanche soir.
 *
 * ⚠ Toutes les bornes sont en heure LOCALE du conteneur : sans TZ ni tzdata,
 * la semaine commencerait à 2 h du matin en été.
 *
 * Badges et classement ne sont stockés nulle part : on les RECALCULE tels
 * qu'ils étaient à chacun des deux lundis, en ne gardant que les amendes créées
 * avant, et on compare. Deux imprécisions assumées : un signalement validé
 * après coup compte à sa date de création, et une amende supprimée disparaît
 * aussi du passé. Figer le résumé à sa production empêche qu'elles le modifient
 * une fois lu.
 */

const PUBLISH_HOUR = 8

/** Cotisations exclues : elles tombent sur toute l'équipe et écraseraient le reste. */
const NOT_DUES = `(r.kind IS NULL OR r.kind <> 'DUES')`

/** « 2026-09-07 », en date locale — jamais toISOString(), qui décalerait d'un jour. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, days: number) => {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

/** Semaines pleines entre deux lundis. Arrondi : un changement d'heure décale d'une heure. */
const weeksBetween = (later: Date, earlier: Date) =>
  Math.round((later.getTime() - earlier.getTime()) / (7 * 86_400_000))

/**
 * Les participants tels qu'ils étaient à cette date : seules les amendes créées
 * avant comptent, et un membre arrivé depuis n'existe pas encore.
 *
 * Le total est rangé dans `totalOwed` : le classement ne regarde que la somme
 * dû + payé, et la répartition entre les deux n'a pas de sens pour le passé.
 */
const membersAt = async (until: Date): Promise<RankInput[]> => {
  const rows = await query<{
    id: number
    display_name: string
    receives_fines: boolean
    fine_count: number
    total: number
  }>(
    `SELECT m.id, m.display_name, m.receives_fines,
            COUNT(f.id)::int                AS fine_count,
            COALESCE(SUM(f.amount), 0)::int AS total
       FROM members m
       LEFT JOIN fines f
              ON f.member_id = m.id
             AND f.status = 'CONFIRMED'
             AND f.created_at < $1
      WHERE m.created_at < $1
      GROUP BY m.id`,
    [until],
  )
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    receivesFines: r.receives_fines,
    fineCount: r.fine_count,
    totalOwed: r.total,
    totalPaid: 0,
  }))
}

/** Un badge s'identifie par sa source et son libellé, pas par son porteur. */
const holders = (badges: Map<number, MemberBadge[]>) => {
  const byKey = new Map<string, { memberId: number; badge: MemberBadge }>()
  for (const [memberId, list] of badges) {
    for (const badge of list) byKey.set(`${badge.source}:${badge.label}`, { memberId, badge })
  }
  return byKey
}

/**
 * Les mouvements qui méritent d'être racontés.
 *
 * Tous les mouvements feraient une liste plus longue que le reste du résumé :
 * une amende en bas du tableau décale d'un rang tous ceux qu'elle dépasse. On
 * garde les entrées et sorties du podium, et la plus grosse montée et la plus
 * grosse chute d'au moins deux places.
 */
const notableMoves = (before: RankInput[], after: RankInput[], names: Map<number, string>) => {
  const rankBefore = new Map(rankedMembers(before).map((m, i) => [m.id, i + 1]))
  const ranked = rankedMembers(after)

  const moves = ranked.map((m, i) => ({ id: m.id, from: rankBefore.get(m.id) ?? null, to: i + 1 }))
  const keep = new Set<number>()

  for (const m of moves) {
    const entered = m.to <= 3 && (m.from === null || m.from > 3)
    const left = m.from !== null && m.from <= 3 && m.to > 3
    if (entered || left) keep.add(m.id)
  }

  const shifts = moves.filter((m) => m.from !== null).map((m) => ({ ...m, delta: m.from! - m.to }))
  const climb = shifts.filter((m) => m.delta >= 2).sort((a, b) => b.delta - a.delta)[0]
  const fall = shifts.filter((m) => m.delta <= -2).sort((a, b) => a.delta - b.delta)[0]
  if (climb) keep.add(climb.id)
  if (fall) keep.add(fall.id)

  return moves
    .filter((m) => keep.has(m.id))
    .map((m) => ({ name: names.get(m.id) ?? '?', from: m.from, to: m.to }))
}

/**
 * La plus longue série de semaines sans amende en cours, au soir du dimanche.
 *
 * Pour un joueur déjà sanctionné, la série compte les semaines depuis celle de
 * sa dernière amende. Pour un joueur jamais sanctionné, elle part de la plus
 * tardive de deux dates : la première amende de la caisse — avant, personne
 * n'en recevait —, et son arrivée dans l'équipe.
 */
const longestStreak = async (weekStart: Date, weekEnd: Date) => {
  const season = await queryOne<{ week: Date | null }>(
    `SELECT date_trunc('week', MIN(f.created_at) AT TIME ZONE 'Europe/Paris')::date AS week
       FROM fines f WHERE f.status = 'CONFIRMED'`,
  )
  if (!season?.week) return null

  const rows = await query<{ name: string; last_week: Date | null; joined_week: Date }>(
    `SELECT m.display_name AS name,
            (SELECT date_trunc('week', MAX(f.created_at) AT TIME ZONE 'Europe/Paris')::date
               FROM fines f
               LEFT JOIN rules r ON r.id = f.rule_id
              WHERE f.member_id = m.id
                AND f.status = 'CONFIRMED'
                AND ${NOT_DUES}
                AND f.created_at < $1)                                   AS last_week,
            date_trunc('week', m.created_at AT TIME ZONE 'Europe/Paris')::date AS joined_week
       FROM members m
      WHERE m.receives_fines AND m.created_at < $1`,
    [weekEnd],
  )

  const streaks = rows.map((r) => {
    if (r.last_week) return { name: r.name, weeks: weeksBetween(weekStart, r.last_week) }
    const origin = r.joined_week > season.week! ? r.joined_week : season.week!
    return { name: r.name, weeks: Math.max(0, weeksBetween(weekStart, origin) + 1) }
  })

  const best = Math.max(0, ...streaks.map((s) => s.weeks))
  // En deçà de deux semaines, « la plus longue série » n'est qu'un joueur sans
  // amende cette semaine : la liste juste au-dessus le dit déjà.
  if (best < 2) return null
  return {
    names: streaks.filter((s) => s.weeks === best).map((s) => s.name).sort(),
    weeks: best,
  }
}

/** Le résumé de la semaine qui commence ce lundi-là, à 0 h. */
export const buildDigest = async (weekStart: Date): Promise<WeeklyDigest> => {
  const weekEnd = addDays(weekStart, 7)
  const previousStart = addDays(weekStart, -7)
  const inWeek = 'f.created_at >= $1 AND f.created_at < $2'

  const sumBetween = (from: Date, to: Date) =>
    queryOne<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(f.amount), 0)::int AS total, COUNT(*)::int AS count
         FROM fines f
         LEFT JOIN rules r ON r.id = f.rule_id
        WHERE f.status = 'CONFIRMED' AND ${NOT_DUES} AND ${inWeek}`,
      [from, to],
    )

  const current = await sumBetween(weekStart, weekEnd)
  const previous = await sumBetween(previousStart, weekStart)

  // Le record se mesure aux semaines d'AVANT, et seulement s'il y en a eu :
  // sinon la toute première semaine serait forcément un record.
  const history = await queryOne<{ weeks: number; best: number }>(
    `SELECT COUNT(*)::int AS weeks, COALESCE(MAX(t), 0)::int AS best
       FROM (SELECT SUM(f.amount) AS t
               FROM fines f
               LEFT JOIN rules r ON r.id = f.rule_id
              WHERE f.status = 'CONFIRMED' AND ${NOT_DUES} AND f.created_at < $1
              GROUP BY date_trunc('week', f.created_at AT TIME ZONE 'Europe/Paris')) w`,
    [weekStart],
  )

  const top = await queryOne<{ name: string; count: number; amount: number }>(
    `SELECT m.display_name AS name, COUNT(*)::int AS count, SUM(f.amount)::int AS amount
       FROM fines f
       JOIN members m ON m.id = f.member_id
       LEFT JOIN rules r ON r.id = f.rule_id
      WHERE f.status = 'CONFIRMED' AND ${NOT_DUES} AND ${inWeek}
      GROUP BY m.id, m.display_name
      ORDER BY count DESC, amount DESC, m.display_name
      LIMIT 1`,
    [weekStart, weekEnd],
  )

  // Les deux états, au lundi d'ouverture et au lundi de clôture.
  const before = await membersAt(weekStart)
  const after = await membersAt(weekEnd)
  const names = new Map(after.map((m) => [m.id, m.displayName]))

  const badgesBefore = holders(await loadBadges(before, weekStart))
  const badgesAfter = holders(await loadBadges(after, weekEnd))

  const badgeChanges: WeeklyDigest['badgeChanges'] = []
  for (const [key, now] of badgesAfter) {
    const then = badgesBefore.get(key)
    if (then && then.memberId === now.memberId) continue
    badgeChanges.push({
      image: now.badge.icon,
      label: now.badge.label,
      to: names.get(now.memberId) ?? '?',
      from: then ? (names.get(then.memberId) ?? '?') : null,
    })
  }

  const penalties = await query<{ name: string; count: number; amount: number }>(
    `SELECT m.display_name AS name, COUNT(*)::int AS count, SUM(f.amount)::int AS amount
       FROM fines f
       JOIN members m ON m.id = f.member_id
       JOIN rules r   ON r.id = f.rule_id
      WHERE f.status = 'CONFIRMED' AND r.kind = 'PENALTY' AND ${inWeek}
      GROUP BY m.id, m.display_name
      ORDER BY count DESC, m.display_name`,
    [weekStart, weekEnd],
  )

  const clean = await query<{ name: string }>(
    `SELECT m.display_name AS name
       FROM members m
      WHERE m.receives_fines
        AND m.created_at < $2
        AND NOT EXISTS (
          SELECT 1 FROM fines f
            LEFT JOIN rules r ON r.id = f.rule_id
           WHERE f.member_id = m.id
             AND f.status = 'CONFIRMED'
             AND ${NOT_DUES}
             AND ${inWeek})
      ORDER BY m.display_name`,
    [weekStart, weekEnd],
  )

  // L'encaissé se date au PAIEMENT, pas à la création : une amende de mars
  // réglée cette semaine est de l'argent entré cette semaine.
  const collected = await queryOne<{ amount: number }>(
    `SELECT COALESCE(SUM(amount), 0)::int AS amount
       FROM fines
      WHERE status = 'CONFIRMED' AND paid_at >= $1 AND paid_at < $2`,
    [weekStart, weekEnd],
  )

  const dues = await queryOne<{ label: string; count: number; amount: number }>(
    `SELECT r.label, COUNT(*)::int AS count, MIN(f.amount)::int AS amount
       FROM fines f
       JOIN rules r ON r.id = f.rule_id
      WHERE f.status = 'CONFIRMED' AND r.kind = 'DUES' AND ${inWeek}
      GROUP BY r.id, r.label
      ORDER BY count DESC
      LIMIT 1`,
    [weekStart, weekEnd],
  )

  return {
    weekStart: dayKey(weekStart),
    weekEnd: dayKey(addDays(weekStart, 6)),
    total: current!.total,
    fineCount: current!.count,
    previousTotal: previous!.total,
    isRecord: history!.weeks > 0 && current!.total > history!.best,
    topPlayer: top ?? null,
    badgeChanges,
    rankMoves: notableMoves(before, after, names),
    penalties,
    cleanPlayers: clean.map((c) => c.name),
    longestStreak: await longestStreak(weekStart, weekEnd),
    collected: collected!.amount,
    dues: dues ?? null,
  }
}

/**
 * Un tour de vérification : publie le résumé de la semaine écoulée s'il ne
 * l'est pas encore et que l'heure est passée.
 *
 * « Passée » et non « exactement maintenant » : si le Raspberry était éteint
 * le lundi à 8 h, le résumé sort au redémarrage.
 */
export const runDigest = async (now = new Date()) => {
  const thisMonday = periodStart('WEEK', now)
  const publishAt = new Date(thisMonday)
  publishAt.setHours(PUBLISH_HOUR, 0, 0, 0)
  if (now < publishAt) return

  const weekStart = addDays(thisMonday, -7)
  const current = await queryOne<{ week_start: Date }>(
    'SELECT week_start FROM weekly_digest WHERE id = 1',
  )
  if (current && dayKey(current.week_start) === dayKey(weekStart)) return

  const digest = await buildDigest(weekStart)
  await query(
    `INSERT INTO weekly_digest (id, week_start, payload)
     VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE
       SET week_start = EXCLUDED.week_start,
           payload    = EXCLUDED.payload,
           created_at = NOW()`,
    [dayKey(weekStart), JSON.stringify(digest)],
  )
}

/** Toutes les minutes, plus un tour immédiat pour rattraper une publication manquée. */
export const startDigest = (onError: (err: unknown) => void) => {
  const tick = () => void runDigest().catch(onError)
  tick()
  // `unref` : ce minuteur ne doit pas empêcher le processus de s'arrêter.
  return setInterval(tick, 60_000).unref()
}
