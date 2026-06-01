import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma, NotificationChannelType } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const IntegrationParams = z.object({ workspaceId: z.string(), id: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const IntegrationResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: z.string(),
  config: z.record(z.unknown()),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CRM_TYPES = ['hubspot', 'salesforce', 'pipedrive', 'zoho', 'generic'] as const

const CrmWebhookBody = z.object({
  webhookUrl: z.string().url(),
  crmType: z.enum(CRM_TYPES),
})

const NotificationPreferenceResponse = z.object({
  id: z.string(),
  userId: z.string(),
  channel: z.string(),
  eventType: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const NotificationPreferencePatch = z.object({
  enabled: z.boolean(),
})

const NOTIFICATION_EVENT_TYPES = [
  'PUBLISH_SUCCESS',
  'PUBLISH_FAILURE',
  'TREND_DIGEST',
  'APPROVAL_NEEDED',
  'COMMENT_MENTION',
] as const

const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'TELEGRAM', 'SLACK'] as const

function serializeIntegration(i: {
  id: string
  workspaceId: string
  type: string
  config: unknown
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: i.id,
    workspaceId: i.workspaceId,
    type: i.type,
    config: i.config as Record<string, unknown>,
    enabled: i.enabled,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }
}

function serializePreference(p: {
  id: string
  userId: string
  channel: string
  eventType: string
  enabled: boolean
  createdAt?: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    userId: p.userId,
    channel: p.channel,
    eventType: p.eventType,
    enabled: p.enabled,
    createdAt: p.createdAt ? p.createdAt.toISOString() : new Date(0).toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export const integrationRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /workspaces/:workspaceId/integrations/crm
  app.post('/integrations/crm', {
    schema: {
      params: WorkspaceParams,
      body: CrmWebhookBody,
      response: {
        201: IntegrationResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { webhookUrl, crmType } = request.body

    const integration = await prisma.integration.create({
      data: {
        workspaceId,
        type: 'CRM_WEBHOOK',
        config: { webhookUrl, crmType },
        enabled: true,
      },
    })

    return reply.status(201).send(serializeIntegration(integration))
  })

  // GET /workspaces/:workspaceId/integrations
  app.get('/integrations', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(IntegrationResponse),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const integrations = await prisma.integration.findMany({
      where: { workspaceId },
    })
    return integrations.map(serializeIntegration)
  })

  // DELETE /workspaces/:workspaceId/integrations/:id
  app.delete('/integrations/:id', {
    schema: {
      params: IntegrationParams,
      response: {
        204: z.null(),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params

    const existing = await prisma.integration.findFirst({
      where: { id, workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Integration not found' })

    await prisma.integration.delete({ where: { id } })
    return reply.status(204).send(null)
  })
}

export const notificationPreferenceRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /notifications/preferences
  // Returns all eventType × channel combinations for the current user,
  // seeding defaults if they don't exist yet.
  app.get('/notifications/preferences', {
    schema: {
      response: {
        200: z.array(NotificationPreferenceResponse),
        401: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) return reply.status(401).send({ error: 'Unauthorized' })
    const userId = request.authUser.userId

    const existing = await prisma.notificationPreference.findMany({
      where: { userId },
    })

    // Seed missing defaults (enabled = true for in_app, false otherwise)
    const existingKeys = new Set(existing.map((p) => `${p.channel}:${p.eventType}`))
    const toCreate: Array<{ userId: string; channel: NotificationChannelType; eventType: string; enabled: boolean }> = []

    for (const channel of NOTIFICATION_CHANNELS) {
      for (const eventType of NOTIFICATION_EVENT_TYPES) {
        if (!existingKeys.has(`${channel}:${eventType}`)) {
          toCreate.push({ userId, channel: channel as NotificationChannelType, eventType, enabled: channel === 'IN_APP' })
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.notificationPreference.createMany({
        data: toCreate,
        skipDuplicates: true,
      })
    }

    const all = await prisma.notificationPreference.findMany({ where: { userId } })
    return reply.status(200).send(all.map(serializePreference))
  })

  // PATCH /notifications/preferences/:id
  app.patch('/notifications/preferences/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      body: NotificationPreferencePatch,
      response: {
        200: NotificationPreferenceResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
  }, async (request, reply) => {
    if (!request.authUser) return reply.status(401).send({ error: 'Unauthorized' })
    const userId = request.authUser.userId
    const { id } = request.params
    const { enabled } = request.body

    const existing = await prisma.notificationPreference.findUnique({
      where: { id },
    })
    if (!existing) return reply.status(404).send({ error: 'Preference not found' })
    if (existing.userId !== userId) return reply.status(403).send({ error: 'Forbidden' })

    const updated = await prisma.notificationPreference.update({
      where: { id },
      data: { enabled },
    })

    return reply.status(200).send(serializePreference(updated))
  })
}
