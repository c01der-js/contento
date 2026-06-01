import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceBody = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
})

const WorkspaceResponse = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
})

const ErrorResponse = z.object({ error: z.string() })

export const workspaceRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces — list workspaces the current user is a member of
  app.get('/', {
    schema: {
      response: {
        200: z.array(WorkspaceResponse),
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) return reply.status(401).send({ error: 'Unauthorized' })
    const memberships = await prisma.membership.findMany({
      where: { userId: request.authUser.userId },
      include: { workspace: true },
    })
    return memberships.map((m) => ({
      ...m.workspace,
      createdAt: m.workspace.createdAt.toISOString(),
    }))
  })

  // POST /workspaces — create a new workspace
  app.post('/', {
    schema: {
      body: WorkspaceBody,
      response: {
        201: WorkspaceResponse,
        401: ErrorResponse,
        409: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) return reply.status(401).send({ error: 'Unauthorized' })
    try {
      const workspace = await prisma.workspace.create({
        data: {
          name: request.body.name,
          slug: request.body.slug,
          memberships: {
            create: {
              userId: request.authUser.userId,
              role: 'OWNER',
            },
          },
        },
      })
      return reply.status(201).send({
        ...workspace,
        createdAt: workspace.createdAt.toISOString(),
      })
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return reply.status(409).send({ error: 'Slug already taken' })
      }
      throw e
    }
  })

  // GET /workspaces/:workspaceId
  app.get('/:workspaceId', {
    schema: {
      params: z.object({ workspaceId: z.string() }),
      response: {
        200: WorkspaceResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'VIEWER')],
  }, async (request, reply) => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: request.params.workspaceId },
    })
    if (!workspace) return reply.status(404).send({ error: 'Workspace not found' })
    return { ...workspace, createdAt: workspace.createdAt.toISOString() }
  })
}
