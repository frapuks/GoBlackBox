import type { RuleKind } from '@blackbox/shared'
import { queryOne } from './db.js'

/**
 * Les interrupteurs de fonctionnalité, tels que le serveur les applique.
 *
 * Le masquage côté front n'est qu'un confort : un appel forgé ne doit pas
 * pouvoir alimenter une fonctionnalité éteinte, ni lire ce qu'elle cache.
 */
export type Features = {
  enableDigest: boolean
  enableBadges: boolean
  enablePenalties: boolean
  enableDues: boolean
  enableLeaderboard: boolean
}

/** Une ligne, une lecture : relue à chaque appel plutôt que mise en cache. */
export const loadFeatures = async (): Promise<Features> => {
  const row = await queryOne<{
    enable_digest: boolean
    enable_badges: boolean
    enable_penalties: boolean
    enable_dues: boolean
    enable_leaderboard: boolean
  }>(
    `SELECT enable_digest, enable_badges, enable_penalties, enable_dues, enable_leaderboard
       FROM settings WHERE id = 1`,
  )
  return {
    enableDigest: row!.enable_digest,
    enableBadges: row!.enable_badges,
    enablePenalties: row!.enable_penalties,
    enableDues: row!.enable_dues,
    enableLeaderboard: row!.enable_leaderboard,
  }
}

/** Le refus d'une sorte de règle coupée, avec un message qui dit laquelle. */
export const disabledKindMessage = (kind: RuleKind) =>
  kind === 'DUES' ? 'Les cotisations sont désactivées' : 'Les pénalités de retard sont désactivées'
