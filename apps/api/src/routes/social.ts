import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma, type Prisma } from '@contento/db'
import { TOPIC_PUBLISH } from '@contento/shared'
import { requireRole } from '../middleware/rbac.js'
import { getKafkaProducer } from '../kafka-producer.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const AccountParams = z.object({ workspaceId: z.string(), accountId: z.string() })
const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// --- SocialAccount schemas ---
const SocialAccountResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  platform: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const SocialAccountBody = z.object({
  platform: z.enum(['telegram', 'instagram', 'tiktok', 'youtube', 'linkedin']),
  name: z.string().min(1),
  credentials: z.record(z.unknown()),
})

// --- Publication schemas ---
const PublicationResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scriptId: z.string(),
  renderJobId: z.string().nullable(),
  socialAccountId: z.string(),
  status: z.string(),
  platformPostId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const PublishBody = z.object({
  socialAccountId: z.string(),
  renderJobId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
})

// --- Serializers ---
function serializeSocialAccount(a: {
  id: string
  workspaceId: string
  platform: string
  name: string
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    platform: a.platform,
    name: a.name,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

function serializePublication(p: {
  id: string
  workspaceId: string
  scriptId: string
  renderJobId: string | null
  socialAccountId: string
  status: string
  platformPostId: string | null
  errorMessage: string | null
  publishedAt: Date | null
  scheduledAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    scriptId: p.scriptId,
    renderJobId: p.renderJobId,
    socialAccountId: p.socialAccountId,
    status: p.status,
    platformPostId: p.platformPostId,
    errorMessage: p.errorMessage,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export const socialRoutes: FastifyPluginAsyncZod = async (app) => {
  // =====================
  // SocialAccount routes
  // =====================

  app.get('/social-accounts', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(SocialAccountResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId: request.params.workspaceId },
    })
    return accounts.map(serializeSocialAccount)
  })

  app.post('/social-accounts', {
    schema: {
      params: WorkspaceParams,
      body: SocialAccountBody,
      response: {
        201: SocialAccountResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { platform, name, credentials } = request.body

    const account = await prisma.socialAccount.create({
      data: { workspaceId, platform, name, credentials: credentials as unknown as Prisma.InputJsonValue },
    })

    return reply.status(201).send(serializeSocialAccount(account))
  })

  app.delete('/social-accounts/:accountId', {
    schema: {
      params: AccountParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, accountId } = request.params

    const existing = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    await prisma.socialAccount.delete({ where: { id: accountId } })
    return reply.status(204).send(null)
  })

  // =====================
  // Publication routes
  // =====================

  app.post('/scripts/:scriptId/publish', {
    schema: {
      params: ScriptParams,
      body: PublishBody,
      response: {
        201: PublicationResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { socialAccountId, renderJobId, scheduledAt } = request.body

    // 1. Verify script exists and is APPROVED
    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Script not found' })
    if (script.status !== 'APPROVED') {
      return reply.status(400).send({ error: 'Script must be APPROVED before publishing' })
    }

    // 2. Verify socialAccount exists in this workspace
    const socialAccount = await prisma.socialAccount.findFirst({
      where: { id: socialAccountId, workspaceId },
    })
    if (!socialAccount) return reply.status(404).send({ error: 'Social account not found' })

    // 3. Create Publication
    const publication = await prisma.publication.create({
      data: {
        workspaceId,
        scriptId,
        renderJobId: renderJobId ?? null,
        socialAccountId,
        status: 'PENDING',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
    })

    // 4. Emit Kafka event publish.requested — skip if scheduled for the future (scheduler handles it)
    const isScheduledFuture = scheduledAt && new Date(scheduledAt) > new Date()
    if (!isScheduledFuture) {
      try {
        const producer = getKafkaProducer()
        await producer.send(TOPIC_PUBLISH, {
          eventId: crypto.randomUUID(),
          workspaceId,
          timestamp: new Date().toISOString(),
          publicationId: publication.id,
          platform: socialAccount.platform,
        })
      } catch (err) {
        app.log.error(err, 'Failed to emit publish.requested Kafka event')
        // Publication stays PENDING — posting-service will pick it up later
      }
    }

    // 5. Return 201 with Publication
    return reply.status(201).send(serializePublication(publication))
  })

  app.get('/scripts/:scriptId/publications', {
    schema: {
      params: ScriptParams,
      response: {
        200: z.array(PublicationResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Script not found' })

    const publications = await prisma.publication.findMany({
      where: { scriptId, workspaceId },
    })

    return reply.status(200).send(publications.map(serializePublication))
  })

  app.patch('/scripts/:scriptId/publications/:publicationId', {
    schema: {
      params: z.object({ workspaceId: z.string(), scriptId: z.string(), publicationId: z.string() }),
      body: z.object({ scheduledAt: z.string().datetime() }),
      response: {
        200: PublicationResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId, publicationId } = request.params
    const { scheduledAt } = request.body

    const pub = await prisma.publication.findFirst({
      where: { id: publicationId, scriptId, workspaceId },
    })
    if (!pub) return reply.status(404).send({ error: 'Publication not found' })
    if (pub.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Only PENDING publications can be rescheduled' })
    }

    const updated = await prisma.publication.update({
      where: { id: publicationId, workspaceId },
      data: { scheduledAt: new Date(scheduledAt) },
    })

    return reply.status(200).send(serializePublication(updated))
  })
}
