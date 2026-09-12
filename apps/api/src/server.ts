import Fastify, { type FastifyError } from 'fastify'
import sensible from '@fastify/sensible'
import { ZodError } from 'zod'
import type { Health } from '@blackbox/shared'
import { registerAuth } from './auth.js'
import { pool, queryOne } from './db.js'
import { authRoutes } from './routes/auth.js'
import { memberRoutes } from './routes/members.js'
import { ruleRoutes } from './routes/rules.js'
import { fineRoutes } from './routes/fines.js'
import { settingsRoutes } from './routes/settings.js'
import { pushRoutes } from './routes/push.js'
import { startReminders } from './reminders.js'

const isProduction = process.env.NODE_ENV === 'production'

const app = Fastify({
  logger: {
    transport: isProduction
      ? undefined
      : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  },
  // Cloudflare et NPM sont en amont : sans ça, tous les logs et toutes les
  // limites verraient l'IP du proxy au lieu de celle du client.
  trustProxy: true,
})

await app.register(sensible)
await registerAuth(app)

// Une validation Zod qui échoue est une erreur du client, pas du serveur.
app.setErrorHandler((error: FastifyError, req, reply) => {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Données invalides',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  const status = error.statusCode ?? 500
  if (status >= 500) req.log.error(error)

  return reply.status(status).send({
    statusCode: status,
    error: error.name,
    message: status >= 500 ? 'Erreur interne' : error.message,
  })
})

// Toutes les routes vivent sous /api, en dev comme en prod : le proxy Vite et
// le Nginx Proxy Manager pointent donc sur exactement le même chemin.
await app.register(
  async (api) => {
    api.get('/health', async (): Promise<Health> => {
      const row = await queryOne<{ now: Date; migrations: number }>(`
        SELECT NOW() AS now,
               (SELECT COUNT(*) FROM _migrations) AS migrations
      `)
      if (!row) throw app.httpErrors.serviceUnavailable('base injoignable')

      return {
        status: 'ok',
        db: true,
        migrations: row.migrations,
        now: row.now.toISOString(),
      }
    })

    await api.register(authRoutes)
    await api.register(memberRoutes)
    await api.register(ruleRoutes)
    await api.register(fineRoutes)
    await api.register(settingsRoutes)
    await api.register(pushRoutes)
  },
  { prefix: '/api' },
)

const port = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// Les rappels de cotisation et de pénalité. Démarrés après l'écoute : un
// minuteur qui échoue ne doit pas empêcher l'app de répondre.
startReminders((err: unknown) => app.log.error({ err }, 'rappel échoué'))

const shutdown = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
