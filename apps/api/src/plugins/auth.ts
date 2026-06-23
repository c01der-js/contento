import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import jwt from 'jsonwebtoken'
import { prisma } from '@contento/db'

interface AuthUser {
  userId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null
  }
}

export const registerAuth = fp(async (app: FastifyInstance) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required')
  app.decorateRequest('authUser', null)

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const token = extractToken(request)
    if (!token) { request.authUser = null; return }
    const userId = decodeUserId(token)
    if (!userId) { request.authUser = null; return }
    await ensureUser(userId)
    request.authUser = { userId }
  })
})

/**
 * Read the bearer token from the Authorization header, or — as a fallback — from a
 * `?token=` query param. The query fallback exists for browser media tags (`<video src>`,
 * `<a download>`) which cannot send custom headers; the token is parsed from the raw URL
 * because `request.query` is not yet populated in the onRequest hook.
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)

  const url = request.raw.url
  if (url) {
    const q = url.indexOf('?')
    if (q !== -1) {
      const token = new URLSearchParams(url.slice(q + 1)).get('token')
      if (token) return token
    }
  }
  return null
}

/** Verify a local JWT (signed by /auth/{register,login}) and return its `sub`, or null. */
export function decodeUserId(token: string): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  try {
    const raw = jwt.verify(token, secret)
    if (typeof raw !== 'object' || raw === null) return null
    const payload = raw as { sub?: string }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

/** Provision the user's first workspace on their first authenticated request. */
async function ensureUser(userId: string): Promise<void> {
  // Fast path — already a member of some workspace.
  const existing = await prisma.membership.findFirst({ where: { userId } })
  if (existing) return

  // The User row is created at /auth/register. If the sub doesn't map to a user, do nothing.
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const slug = `ws-${userId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase()}`
  const workspaceName = user.name ? `${user.name}'s Workspace` : 'My Workspace'

  try {
    await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    })
  } catch (e: unknown) {
    // P2002 = unique constraint — a concurrent first request already created it; ignore.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') return
    throw e
  }
}
