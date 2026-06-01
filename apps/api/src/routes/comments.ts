import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const CommentParams = z.object({ workspaceId: z.string(), commentId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const CommentEntityTypeSchema = z.enum(['SCRIPT', 'IDEA', 'PUBLICATION', 'TREND'])

const CommentResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  entityType: CommentEntityTypeSchema,
  entityId: z.string(),
  authorId: z.string(),
  body: z.string(),
  mentions: z.array(z.string()),
  createdAt: z.string(),
})

const CommentQuerystring = z.object({
  entityType: CommentEntityTypeSchema,
  entityId: z.string(),
})

const CreateCommentBody = z.object({
  entityType: CommentEntityTypeSchema,
  entityId: z.string().min(1),
  body: z.string().min(1),
  mentions: z.array(z.string()).optional(),
})

function serializeComment(c: {
  id: string
  workspaceId: string
  entityType: string
  entityId: string
  authorId: string
  body: string
  mentions: string[]
  createdAt: Date
}) {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    entityType: c.entityType as 'SCRIPT' | 'IDEA' | 'PUBLICATION' | 'TREND',
    entityId: c.entityId,
    authorId: c.authorId,
    body: c.body,
    mentions: c.mentions,
    createdAt: c.createdAt.toISOString(),
  }
}

export const commentRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/comments?entityType=SCRIPT&entityId=:id
  app.get('/comments', {
    schema: {
      params: WorkspaceParams,
      querystring: CommentQuerystring,
      response: {
        200: z.array(CommentResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { entityType, entityId } = request.query

    const comments = await prisma.comment.findMany({
      where: { workspaceId, entityType, entityId },
      orderBy: { createdAt: 'asc' },
    })

    return comments.map(serializeComment)
  })

  // POST /workspaces/:workspaceId/comments
  app.post('/comments', {
    schema: {
      params: WorkspaceParams,
      body: CreateCommentBody,
      response: {
        201: CommentResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { entityType, entityId, body, mentions } = request.body
    const userId = request.authUser?.userId
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const comment = await prisma.comment.create({
      data: {
        workspaceId,
        entityType,
        entityId,
        authorId: userId,
        body,
        mentions: mentions ?? [],
      },
    })

    return reply.status(201).send(serializeComment(comment))
  })

  // DELETE /workspaces/:workspaceId/comments/:commentId  (author or ADMIN/OWNER only)
  app.delete('/comments/:commentId', {
    schema: {
      params: CommentParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, commentId } = request.params
    const userId = request.authUser?.userId
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' })

    const comment = await prisma.comment.findFirst({ where: { id: commentId, workspaceId } })
    if (!comment) return reply.status(404).send({ error: 'Not found' })

    // Check membership role for ADMIN/OWNER privilege
    const membership = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })

    const isPrivileged = membership?.role === 'ADMIN' || membership?.role === 'OWNER'
    const isAuthor = comment.authorId === userId

    if (!isAuthor && !isPrivileged) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    await prisma.comment.delete({ where: { id: commentId } })
    return reply.status(204).send(null)
  })
}
