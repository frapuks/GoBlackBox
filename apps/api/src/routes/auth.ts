import type { FastifyPluginAsync } from 'fastify'
import {
  claimInput,
  loginInput,
  signupInput,
  type ClaimableMember,
  type Me,
  type Role,
  type SignupContext,
} from '@blackbox/shared'
import { COOKIE_NAME, cookieOptions, hashPassword, verifyPassword } from '../auth.js'
import { query, queryOne, transaction } from '../db.js'

const loadMe = async (userId: number): Promise<Me> => {
  const row = await queryOne<{
    id: number
    email: string
    role: Role
    member_id: number | null
    display_name: string | null
  }>(
    `SELECT u.id, u.email, u.role,
            m.id AS member_id, m.display_name
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  )
  if (!row) throw new Error('utilisateur introuvable')

  return {
    user: { id: row.id, email: row.email, role: row.role },
    member: row.member_id ? { id: row.member_id, displayName: row.display_name! } : null,
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /** Dit au front s'il doit afficher le champ « code d'invitation ». */
  app.get('/auth/context', async (): Promise<SignupContext> => {
    const row = await queryOne<{ count: number }>('SELECT COUNT(*)::int AS count FROM users')
    return { firstAccount: (row?.count ?? 0) === 0 }
  })

  app.post('/auth/signup', async (req, reply): Promise<Me> => {
    const body = signupInput.parse(req.body)

    const userId = await transaction(async (client) => {
      // Sérialise les inscriptions concurrentes : sans ce verrou, deux
      // premières inscriptions simultanées verraient toutes les deux une table
      // vide et deviendraient toutes les deux ADMIN.
      await client.query('SELECT pg_advisory_xact_lock(4242)')

      const { rows: counts } = await client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM users',
      )
      const isFirstAccount = counts[0]!.count === 0

      if (!isFirstAccount) {
        const { rows: settings } = await client.query<{ invite_code: string }>(
          'SELECT invite_code FROM settings WHERE id = 1',
        )
        if (!body.inviteCode || body.inviteCode.toUpperCase() !== settings[0]!.invite_code) {
          throw app.httpErrors.forbidden("Code d'invitation invalide")
        }
      }

      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [body.email])
      if (existing.rowCount) throw app.httpErrors.conflict('Cet email est déjà utilisé')

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [body.email, await hashPassword(body.password), isFirstAccount ? 'ADMIN' : 'PLAYER'],
      )
      return rows[0]!.id
    })

    reply.setCookie(COOKIE_NAME, app.jwt.sign({ uid: userId }), cookieOptions)
    return loadMe(userId)
  })

  app.post('/auth/login', async (req, reply): Promise<Me> => {
    const body = loginInput.parse(req.body)

    const row = await queryOne<{ id: number; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [body.email],
    )

    // Message identique dans les deux cas : ne pas révéler quels emails existent.
    const invalid = app.httpErrors.unauthorized('Email ou mot de passe incorrect')
    if (!row) throw invalid
    if (!(await verifyPassword(body.password, row.password_hash))) throw invalid

    reply.setCookie(COOKIE_NAME, app.jwt.sign({ uid: row.id }), cookieOptions)
    return loadMe(row.id)
  })

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' })
    return { ok: true }
  })

  app.get('/auth/me', { preHandler: [app.requireAuth] }, async (req): Promise<Me> =>
    loadMe(req.currentUser.id),
  )

  /** Membres fantômes disponibles, proposés juste après l'inscription. */
  app.get(
    '/auth/claimable',
    { preHandler: [app.requireAuth] },
    async (): Promise<ClaimableMember[]> => {
      const rows = await query<{ id: number; display_name: string }>(
        `SELECT id, display_name
           FROM members
          WHERE user_id IS NULL
          ORDER BY display_name`,
      )
      return rows.map((r) => ({ id: r.id, displayName: r.display_name }))
    },
  )

  app.post('/auth/claim', { preHandler: [app.requireAuth] }, async (req): Promise<Me> => {
    const body = claimInput.parse(req.body)
    const userId = req.currentUser.id

    await transaction(async (client) => {
      const { rows: already } = await client.query('SELECT 1 FROM members WHERE user_id = $1', [
        userId,
      ])
      if (already.length) throw app.httpErrors.conflict('Ce compte est déjà rattaché à un membre')

      if ('memberId' in body) {
        // Le WHERE user_id IS NULL rend l'opération atomique : deux personnes
        // qui réclament le même nom en même temps, une seule passe.
        const { rowCount } = await client.query(
          'UPDATE members SET user_id = $1 WHERE id = $2 AND user_id IS NULL',
          [userId, body.memberId],
        )
        if (!rowCount) throw app.httpErrors.conflict('Ce membre est déjà pris')
      } else {
        await client.query('INSERT INTO members (display_name, user_id) VALUES ($1, $2)', [
          body.displayName,
          userId,
        ])
      }
    })

    return loadMe(userId)
  })
}
