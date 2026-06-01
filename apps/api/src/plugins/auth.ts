import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken, createClerkClient } from '@clerk/backend'
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
  app.decorateRequest('authUser', null)

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      request.authUser = null
      return
    }

    const token = authHeader.slice(7)
    const secretKey = process.env.CLERK_SECRET_KEY

    if (!secretKey) {
      // CLERK_SECRET_KEY not set — development fallback (decode without verify)
      try {
        const [, payloadB64] = token.split('.')
        if (!payloadB64) { request.authUser = null; return }
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { sub?: string }
        if (!payload.sub) { request.authUser = null; return }
        await ensureUser(payload.sub)
        request.authUser = { userId: payload.sub }
      } catch {
        request.authUser = null
      }
      return
    }

    try {
      const payload = await verifyToken(token, { secretKey })
      await ensureUser(payload.sub)
      request.authUser = { userId: payload.sub }
    } catch {
      request.authUser = null
    }
  })
})

async function ensureUser(clerkId: string): Promise<void> {
  // Fast path — user already has a workspace, nothing to provision.
  const existing = await prisma.membership.findFirst({ where: { userId: clerkId } })
  if (existing) return

  // Fetch real profile from Clerk when the secret key is available.
  let email = `${clerkId}@clerk.local`
  let firstName: string | null = null
  const secretKey = process.env.CLERK_SECRET_KEY
  if (secretKey) {
    try {
      const clerk = createClerkClient({ secretKey })
      const user = await clerk.users.getUser(clerkId)
      email = user.emailAddresses[0]?.emailAddress ?? email
      firstName = user.firstName ?? null
    } catch {
      // Fall back to synthetic values — don't block the request.
    }
  }

  await prisma.user.upsert({
    where: { id: clerkId },
    update: {},
    create: { id: clerkId, email, name: firstName ?? null },
  })

  // Auto-create the first workspace. Deterministic slug so concurrent first-requests
  // collapse to a single workspace via the unique-constraint catch below.
  const slug = `ws-${clerkId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase()}`
  const workspaceName = firstName ? `${firstName}'s Workspace` : 'My Workspace'

  try {
    await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug,
        memberships: { create: { userId: clerkId, role: 'OWNER' } },
      },
    })
  } catch (e: unknown) {
    // P2002 = unique constraint — another concurrent request already created it; ignore.
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') return
    throw e
  }
}
