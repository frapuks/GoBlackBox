import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { Role } from '@blackbox/shared'
import { queryOne } from './db.js'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

/**
 * Hachage via scrypt (node:crypto) plutôt que bcrypt/argon2 : ce sont des
 * modules natifs, qui doivent être recompilés pour l'architecture cible.
 * Sur un Raspberry Pi 32 bits c'est une source d'ennuis garantie, alors que
 * scrypt est dans le runtime Node et recommandé par l'OWASP.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false

  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  // timingSafeEqual exige des longueurs identiques, et évite de laisser fuir
  // le nombre d'octets corrects via le temps de réponse.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const COOKIE_NAME = 'blackbox_token'

const isProduction = process.env.NODE_ENV === 'production'

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  // En prod l'app est servie en HTTPS derrière Cloudflare + NPM.
  secure: isProduction,
  maxAge: 60 * 60 * 24 * 30,
} as const

type CurrentUser = {
  id: number
  email: string
  role: Role
  /** null tant que le compte n'a pas réclamé son membre (juste après signup). */
  memberId: number | null
  memberName: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: CurrentUser
  }
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler
    /** Auth + membre réclamé. Toute action métier en a besoin (created_by). */
    requireMember: preHandlerHookHandler
    requireRole: (...roles: Role[]) => preHandlerHookHandler
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { uid: number }
    user: { uid: number }
  }
}

export const registerAuth = async (app: FastifyInstance) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET manquant')

  await app.register(cookie)
  await app.register(jwt, {
    secret,
    // Le token voyage en cookie httpOnly : inaccessible au JavaScript, donc
    // pas de vol de session via XSS. Aucun header Authorization à gérer.
    cookie: { cookieName: COOKIE_NAME, signed: false },
  })

  app.decorate('requireAuth', async (req) => {
    try {
      await req.jwtVerify()
    } catch {
      throw app.httpErrors.unauthorized('Session expirée')
    }

    const row = await queryOne<{
      id: number
      email: string
      role: Role
      member_id: number | null
      member_name: string | null
    }>(
      `SELECT u.id, u.email, u.role, m.id AS member_id, m.display_name AS member_name
         FROM users u
         LEFT JOIN members m ON m.user_id = u.id
        WHERE u.id = $1`,
      [req.user.uid],
    )

    // Le compte a pu être supprimé alors que le cookie est encore valide.
    if (!row) throw app.httpErrors.unauthorized('Compte introuvable')

    req.currentUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      memberId: row.member_id,
      memberName: row.member_name,
    }
  })

  app.decorate('requireMember', async (req) => {
    if (!req.currentUser?.memberId) {
      throw app.httpErrors.forbidden('Profil incomplet : réclame ton nom dans la liste')
    }
  })

  app.decorate(
    'requireRole',
    (...roles: Role[]): preHandlerHookHandler =>
      async (req) => {
        if (!roles.includes(req.currentUser.role)) {
          throw app.httpErrors.forbidden('Droits insuffisants')
        }
      },
  )
}

/** Code d'invitation lisible : ni O/0 ni I/1, pour éviter les erreurs de saisie. */
export const generateInviteCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(8))
    .map((b) => alphabet[b % alphabet.length])
    .join('')
}
