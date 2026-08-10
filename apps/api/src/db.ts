import pg from 'pg'

const { Pool, types } = pg

// Postgres renvoie les INTEGER en number par défaut, mais BIGINT (donc les
// SUM(), COUNT()) arrivent en string pour éviter les pertes de précision.
// Nos montants tiennent très largement dans un number JS : on les convertit.
types.setTypeParser(types.builtins.INT8, (v) => Number(v))
// NUMERIC, pour les éventuels AVG().
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v))

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL manquant')

export const pool = new Pool({ connectionString })

/**
 * Helper de requête.
 *
 * Deux règles non négociables partout dans le projet :
 *  1. Toujours passer les valeurs en paramètres ($1, $2), jamais par
 *     concaténation de chaîne — c'est la seule protection contre l'injection.
 *  2. Jamais de `SELECT *` : le type T est une PROMESSE, pas une vérification.
 *     Si une colonne manque dans le SELECT, TypeScript ne dira rien et on
 *     récupérera un `undefined` au runtime.
 */
export const query = async <T extends pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> => {
  const result = await pool.query<T>(sql, params as unknown[])
  return result.rows
}

/** Idem, mais pour les requêtes qui doivent retourner exactement une ligne. */
export const queryOne = async <T extends pg.QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | null> => {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

/** Exécute un bloc dans une transaction, avec ROLLBACK automatique en cas d'erreur. */
export const transaction = async <T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
