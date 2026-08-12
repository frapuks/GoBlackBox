import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
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
const BACKUP_DIR = process.env.BACKUP_DIR
const KEEP_BACKUPS = 10

/** Un `pg_dump` complet vers un fichier. Échoue bruyamment : c'est le but. */
const pgDump = (file: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      'pg_dump',
      ['--dbname', process.env.DATABASE_URL!, '--file', file, '--no-owner'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `pg_dump a quitté avec ${code}`)),
    )
  })

/** Ne garde que les KEEP_BACKUPS sauvegardes les plus récentes : la carte SD est petite. */
const prune = async () => {
  const files = (await readdir(BACKUP_DIR!)).filter((f) => f.endsWith('.sql')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) {
    await unlink(join(BACKUP_DIR!, old))
  }
}

/**
 * Sauvegarde avant d'appliquer quoi que ce soit.
 *
 * Rien à sauvegarder sur une base neuve : `alreadyApplied` vaut 0 seulement à
 * la toute première installation, et un dump vide n'aurait aucune valeur.
 * En cas d'échec on s'arrête AVANT de migrer — une migration sans filet est
 * précisément ce qu'on cherche à éviter.
 */
const backup = async (alreadyApplied: number, nextMigration: string) => {
  if (!BACKUP_DIR || alreadyApplied === 0) return

  await mkdir(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = join(BACKUP_DIR, `blackbox-${stamp}-avant-${nextMigration.replace('.sql', '')}.sql`)

  await pgDump(file)
  console.log(`[migrate] sauvegarde : ${file}`)
  await prune()
}

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

  await backup(applied.size, pending[0]!)

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
