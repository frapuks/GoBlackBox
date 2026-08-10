import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, transaction } from './db.js'

/**
 * Runner de migrations minimal.
 *
 * Les fichiers `NNN_nom.sql` sont appliqués dans l'ordre, une seule fois,
 * chacun dans sa propre transaction. Un fichier déjà appliqué n'est JAMAIS
 * rejoué : pour corriger quelque chose, on ajoute un nouveau fichier.
 *
 * Lancé explicitement (`npm run migrate`), pas au démarrage du serveur —
 * sinon deux instances qui bootent en même temps se marchent dessus.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

const run = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
  )

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  const pending = files.filter((f) => !applied.has(f))
  if (pending.length === 0) {
    console.log(`[migrate] rien à faire (${applied.size} migration(s) déjà appliquée(s))`)
    return
  }

  for (const file of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    await transaction(async (client) => {
      await client.query(sql)
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file])
    })
    console.log(`[migrate] ✓ ${file}`)
  }

  console.log(`[migrate] ${pending.length} migration(s) appliquée(s)`)
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[migrate] échec :', err)
    await pool.end()
    process.exit(1)
  })
