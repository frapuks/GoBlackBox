import { pool, transaction } from './db.js'

/**
 * Jeu de données de démonstration — DÉVELOPPEMENT UNIQUEMENT.
 *
 *   npm run seed
 *
 * Remplit la caisse avec un effectif complet et un historique d'amendes, pour
 * voir l'interface avec des données réalistes. Les comptes existants et leur
 * membre rattaché sont conservés : seuls les participants sans compte et les
 * amendes sont remplacés.
 */

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] refus : ce script ne doit jamais tourner en production')
  process.exit(1)
}

/**
 * Générateur pseudo-aléatoire à graine fixe : deux exécutions produisent le
 * même jeu de données, donc une capture d'écran reste comparable d'une fois
 * sur l'autre.
 */
let state = 42
const random = () => {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
const range = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))

const RULES = [
  ['Retard vestiaire', "Moins de 15 minutes avant le début de l'échauffement", 5],
  ['Absence entraînement', "Absence non justifiée moins de 24 h à l'avance", 10],
  ['Oubli matériel', 'Chasuble, gourde ou short non officiel', 2],
  ['Carton rouge', "Exclusion directe lors d'un match officiel", 15],
  ['Carton jaune', 'Avertissement en match officiel', 3],
  ['Téléphone en réunion', 'Sonnerie pendant le débrief', 5],
  ['Tir raté sur but vide', 'Sans commentaire', 5],
  ['Moins de 25 buts', "Performance collective insuffisante : tournée du coach", 0],
  ['Anniversaire', "Le traditionnel gâteau pour l'équipe", 0],
] as const

const PLAYERS = [
  'Lucas Dubois', 'Maxime Renard', 'Théo Lambert', 'Julien Martin', 'Antoine Bernard',
  'Hugo Petit', 'Nathan Roux', 'Enzo Moreau', 'Clément Girard', 'Baptiste Fournier',
  'Romain Lefèvre', 'Alexandre Mercier', 'Quentin Blanc', 'Mathieu Garnier',
  'Florian Chevalier', 'Kevin Marchand', 'Damien Leroy',
] as const

const TOTAL_MEMBERS = 17
const TOTAL_FINES = 70

const run = async () => {
  await transaction(async (client) => {
    await client.query('DELETE FROM fines')
    // Les membres rattachés à un compte sont conservés : les supprimer
    // déconnecterait les utilisateurs existants de leur historique.
    await client.query('DELETE FROM members WHERE user_id IS NULL')
    await client.query('DELETE FROM rules')

    const { rows: ruleRows } = await client.query<{ id: number }>(
      `INSERT INTO rules (label, description, amount)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[])
       RETURNING id`,
      [RULES.map((r) => r[0]), RULES.map((r) => r[1]), RULES.map((r) => r[2])],
    )

    const { rows: kept } = await client.query<{ id: number }>(
      'SELECT id FROM members ORDER BY id',
    )

    const missing = Math.max(0, TOTAL_MEMBERS - kept.length)
    const { rows: created } = await client.query<{ id: number }>(
      `INSERT INTO members (display_name)
       SELECT * FROM UNNEST($1::text[])
       RETURNING id`,
      [PLAYERS.slice(0, missing)],
    )

    const memberIds = [...kept, ...created].map((m) => m.id)
    const author = memberIds[0]!

    // Amendes réparties sur 45 jours : certaines dépassent forcément le seuil
    // de retard, ce qui permet de voir les badges rouges.
    for (let i = 0; i < TOTAL_FINES; i++) {
      const rule = RULES[Math.floor(random() * RULES.length)]!
      const ruleId = ruleRows[RULES.indexOf(rule)]!.id
      const daysAgo = range(0, 45)
      const paid = random() < 0.35

      await client.query(
        `INSERT INTO fines (member_id, rule_id, amount, label, created_by, created_at, paid_at)
         VALUES ($1, $2, $3, $4, $5, NOW() - ($6 || ' days')::interval,
                 CASE WHEN $7::boolean THEN NOW() - ($8 || ' days')::interval ELSE NULL END)`,
        [
          pick(memberIds),
          ruleId,
          rule[2],
          rule[0],
          author,
          daysAgo,
          paid,
          Math.max(0, daysAgo - range(0, 5)),
        ],
      )
    }

    console.log(
      `[seed] ${memberIds.length} membres · ${ruleRows.length} règles · ${TOTAL_FINES} amendes`,
    )
  })
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[seed] échec :', err)
    await pool.end()
    process.exit(1)
  })
