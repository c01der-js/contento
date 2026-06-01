import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const Params = z.object({ workspaceId: z.string() })
const ProjectParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ProjectBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
})

const ProjectPatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
})

const ProjectResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function serializeProject(p: {
  id: string
  workspaceId: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    description: p.description ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/projects
  app.get('/projects', {
    schema: {
      params: Params,
      response: {
        200: z.array(ProjectResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'AUTHOR', 'DESIGNER', 'VIEWER', 'CLIENT')],
  }, async (request) => {
    const { workspaceId } = request.params
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })
    return projects.map(serializeProject)
  })

  // POST /workspaces/:workspaceId/projects
  app.post('/projects', {
    schema: {
      params: Params,
      body: ProjectBody,
      response: {
        201: ProjectResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'DESIGNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: request.body.name,
        description: request.body.description ?? null,
      },
    })
    return reply.status(201).send(serializeProject(project))
  })

  // PATCH /workspaces/:workspaceId/projects/:id
  app.patch('/projects/:id', {
    schema: {
      params: ProjectParams,
      body: ProjectPatchBody,
      response: {
        200: ProjectResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'DESIGNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params
    const existing = await prisma.project.findFirst({ where: { id, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Project not found' })

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(request.body.name !== undefined && { name: request.body.name }),
        ...(request.body.description !== undefined && { description: request.body.description }),
      },
    })
    return serializeProject(updated)
  })

  // DELETE /workspaces/:workspaceId/projects/:id
  app.delete('/projects/:id', {
    schema: {
      params: ProjectParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params
    const existing = await prisma.project.findFirst({ where: { id, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Project not found' })

    await prisma.project.delete({ where: { id } })
    return reply.status(204).send(null)
  })
}
