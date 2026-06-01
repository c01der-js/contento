import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const Params = z.object({ workspaceId: z.string() })
const TaskParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const TaskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE'])

const TaskBody = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
})

const TaskPatchBody = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: TaskStatusEnum.optional(),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().optional(),
})

const TaskQuerystring = z.object({
  assigneeId: z.string().optional(),
  status: TaskStatusEnum.optional(),
})

const TaskResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: TaskStatusEnum,
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

function serializeTask(t: {
  id: string
  workspaceId: string
  projectId: string | null
  assigneeId: string | null
  title: string
  description: string | null
  dueDate: Date | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  relatedEntityType: string | null
  relatedEntityId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    projectId: t.projectId ?? null,
    assigneeId: t.assigneeId ?? null,
    title: t.title,
    description: t.description ?? null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status,
    relatedEntityType: t.relatedEntityType ?? null,
    relatedEntityId: t.relatedEntityId ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

export const taskRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/tasks
  app.get('/tasks', {
    schema: {
      params: Params,
      querystring: TaskQuerystring,
      response: {
        200: z.array(TaskResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'APPROVER', 'AUTHOR', 'DESIGNER', 'VIEWER', 'CLIENT')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { assigneeId, status } = request.query

    const resolvedAssigneeId =
      assigneeId === 'me' ? request.authUser!.userId : assigneeId

    const tasks = await prisma.task.findMany({
      where: {
        workspaceId,
        ...(resolvedAssigneeId !== undefined && { assigneeId: resolvedAssigneeId }),
        ...(status !== undefined && { status }),
      },
      orderBy: { createdAt: 'desc' },
    })

    return tasks.map(serializeTask)
  })

  // POST /workspaces/:workspaceId/tasks
  app.post('/tasks', {
    schema: {
      params: Params,
      body: TaskBody,
      response: {
        201: TaskResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'DESIGNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const task = await prisma.task.create({
      data: {
        workspaceId,
        title: request.body.title,
        description: request.body.description ?? null,
        dueDate: request.body.dueDate ? new Date(request.body.dueDate) : null,
        assigneeId: request.body.assigneeId ?? null,
        projectId: request.body.projectId ?? null,
        relatedEntityType: request.body.relatedEntityType ?? null,
        relatedEntityId: request.body.relatedEntityId ?? null,
        status: 'TODO',
      },
    })
    return reply.status(201).send(serializeTask(task))
  })

  // PATCH /workspaces/:workspaceId/tasks/:id
  app.patch('/tasks/:id', {
    schema: {
      params: TaskParams,
      body: TaskPatchBody,
      response: {
        200: TaskResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'DESIGNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params
    const existing = await prisma.task.findFirst({ where: { id, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(request.body.title !== undefined && { title: request.body.title }),
        ...(request.body.description !== undefined && { description: request.body.description }),
        ...(request.body.status !== undefined && { status: request.body.status }),
        ...(request.body.dueDate !== undefined && { dueDate: new Date(request.body.dueDate) }),
        ...(request.body.assigneeId !== undefined && { assigneeId: request.body.assigneeId }),
      },
    })
    return serializeTask(updated)
  })

  // DELETE /workspaces/:workspaceId/tasks/:id
  app.delete('/tasks/:id', {
    schema: {
      params: TaskParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('OWNER', 'ADMIN', 'EDITOR', 'AUTHOR', 'DESIGNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params
    const existing = await prisma.task.findFirst({ where: { id, workspaceId } })
    if (!existing) return reply.status(404).send({ error: 'Task not found' })

    await prisma.task.delete({ where: { id } })
    return reply.status(204).send(null)
  })
}
