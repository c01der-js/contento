import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireMinRole } from '../middleware/rbac.js'

const ROLES_ENUM = z.enum(['ADMIN', 'EDITOR', 'APPROVER', 'VIEWER', 'AUTHOR', 'DESIGNER', 'CLIENT'])
const ErrorResponse = z.object({ error: z.string() })

const MemberResponse = z.object({
  userId: z.string(),
  role: z.string(),
  joinedAt: z.string(),
})

const InvitationResponse = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
})

export const invitationRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── Members ──────────────────────────────────────────────────────────────

  // GET /:workspaceId/members
  app.get('/:workspaceId/members', {
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: z.array(MemberResponse), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireMinRole('VIEWER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const members = await prisma.membership.findMany({ where: { workspaceId } })
    return members.map((m) => ({
      userId: m.userId,
      role: m.role as string,
      joinedAt: m.createdAt.toISOString(),
    }))
  })

  // PATCH /:workspaceId/members/:userId
  app.patch('/:workspaceId/members/:userId', {
    schema: {
      params: z.object({ workspaceId: z.string(), userId: z.string() }),
      body: z.object({ role: ROLES_ENUM }),
      response: { 200: MemberResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireMinRole('ADMIN')],
  }, async (request, reply) => {
    const { workspaceId, userId } = request.params
    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!membership) return reply.status(404).send({ error: 'Member not found' })
    if (membership.role === 'OWNER') return reply.status(400).send({ error: 'Cannot change the owner role' })
    const updated = await prisma.membership.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role: request.body.role },
    })
    return { userId: updated.userId, role: updated.role as string, joinedAt: updated.createdAt.toISOString() }
  })

  // DELETE /:workspaceId/members/:userId
  app.delete('/:workspaceId/members/:userId', {
    schema: {
      params: z.object({ workspaceId: z.string(), userId: z.string() }),
      response: { 204: z.null(), 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireMinRole('ADMIN')],
  }, async (request, reply) => {
    const { workspaceId, userId } = request.params
    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!membership) return reply.status(404).send({ error: 'Member not found' })
    if (membership.role === 'OWNER') return reply.status(400).send({ error: 'Cannot remove the owner' })
    await prisma.membership.delete({ where: { workspaceId_userId: { workspaceId, userId } } })
    return reply.status(204).send(null)
  })

  // ── Invitations ───────────────────────────────────────────────────────────

  // GET /:workspaceId/invitations
  app.get('/:workspaceId/invitations', {
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: { 200: z.array(InvitationResponse), 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireMinRole('ADMIN')],
  }, async (request) => {
    const { workspaceId } = request.params
    const invitations = await prisma.invitation.findMany({ where: { workspaceId } })
    return invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role as string,
      token: i.token,
      expiresAt: i.expiresAt.toISOString(),
      acceptedAt: i.acceptedAt ? i.acceptedAt.toISOString() : null,
    }))
  })

  // POST /:workspaceId/invitations
  app.post('/:workspaceId/invitations', {
    schema: {
      params: z.object({ workspaceId: z.string() }),
      body: z.object({
        email: z.string().email(),
        role: ROLES_ENUM,
      }),
      response: {
        201: z.object({ id: z.string(), email: z.string(), token: z.string() }),
        401: ErrorResponse,
        403: ErrorResponse,
        409: ErrorResponse,
      },
    },
    preHandler: [requireMinRole('ADMIN')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { email, role } = request.body
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    try {
      const invitation = await prisma.invitation.create({
        data: {
          workspaceId,
          email,
          role,
          expiresAt,
          invitedById: request.authUser?.userId ?? null,
        },
      })
      return reply.status(201).send({ id: invitation.id, email: invitation.email, token: invitation.token })
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'An invitation for this email already exists' })
      }
      throw e
    }
  })

  // DELETE /:workspaceId/invitations/:id
  app.delete('/:workspaceId/invitations/:id', {
    schema: {
      params: z.object({ workspaceId: z.string(), id: z.string() }),
      response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
    preHandler: [requireMinRole('ADMIN')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params
    const invitation = await prisma.invitation.findFirst({ where: { id, workspaceId } })
    if (!invitation) return reply.status(404).send({ error: 'Invitation not found' })
    await prisma.invitation.delete({ where: { id } })
    return reply.status(204).send(null)
  })

  // ── Accept invitation ─────────────────────────────────────────────────────

  // GET /invitations/:token/preview  (public — used by sign-up to validate token)
  // Returns 200 with limited info if the invitation is usable, 410 if expired/used,
  // 404 if not found. Never reveals secrets beyond the email tied to the invite.
  app.get('/invitations/:token/preview', {
    schema: {
      params: z.object({ token: z.string().min(1).max(256) }),
      response: {
        200: z.object({
          email: z.string(),
          workspaceId: z.string(),
          role: z.string(),
          expiresAt: z.string(),
        }),
        404: ErrorResponse,
        410: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    const invitation = await prisma.invitation.findUnique({
      where: { token: request.params.token },
    })
    if (!invitation) return reply.status(404).send({ error: 'Invitation not found' })
    if (invitation.acceptedAt) {
      return reply.status(410).send({ error: 'Invitation already used' })
    }
    if (invitation.expiresAt < new Date()) {
      return reply.status(410).send({ error: 'Invitation expired' })
    }
    return reply.status(200).send({
      email: invitation.email,
      workspaceId: invitation.workspaceId,
      role: invitation.role as string,
      expiresAt: invitation.expiresAt.toISOString(),
    })
  })

  // POST /invitations/:token/accept  (maps to POST /workspaces/invitations/:token/accept)
  app.post('/invitations/:token/accept', {
    schema: {
      params: z.object({ token: z.string() }),
      response: {
        200: z.object({ workspaceId: z.string() }),
        400: ErrorResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) return reply.status(401).send({ error: 'Unauthorized' })
    const invitation = await prisma.invitation.findUnique({ where: { token: request.params.token } })
    if (!invitation) return reply.status(404).send({ error: 'Invitation not found' })
    if (invitation.acceptedAt) return reply.status(400).send({ error: 'Invitation already used' })
    if (invitation.expiresAt < new Date()) return reply.status(400).send({ error: 'Invitation expired' })

    const userId = request.authUser.userId
    try {
      await prisma.membership.create({
        data: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
      })
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        // Already a member — still mark accepted
      } else {
        throw e
      }
    }
    await prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
    return { workspaceId: invitation.workspaceId }
  })
}
