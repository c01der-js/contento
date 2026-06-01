import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole, requireRole } from '../middleware/rbac.js'
import { generateContentPlan } from '@contento/ai'
import { getCampaignProducerQueue } from '../queue.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const CampaignParams = z.object({ workspaceId: z.string(), campaignId: z.string() })
const ItemParams = z.object({ workspaceId: z.string(), campaignId: z.string(), itemId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const ContentPlanItemResponse = z.object({
  id: z.string(),
  index: z.number(),
  topic: z.string(),
  format: z.string(),
  scheduledDate: z.string(),
  hook: z.string(),
  status: z.string(),
  rejectComment: z.string().nullable(),
  scriptId: z.string().nullable(),
  videoJobId: z.string().nullable(),
  publicationId: z.string().nullable(),
})

const ContentPlanResponse = z.object({
  id: z.string(),
  status: z.string(),
  items: z.array(ContentPlanItemResponse),
})

const CampaignResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  goal: z.string(),
  targetAction: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentPlan: ContentPlanResponse.nullable(),
})

const CampaignListResponse = z.object({ items: z.array(CampaignResponse) })

const CreateBody = z.object({
  name: z.string().min(1),
  goal: z.enum(['SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH']),
  targetAction: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
})

const RejectBody = z.object({ comment: z.string().min(1) })

function serializeItem(item: {
  id: string; index: number; topic: string; format: string; scheduledDate: Date
  hook: string; status: string; rejectComment: string | null
  scriptId: string | null; videoJobId: string | null; publicationId: string | null
}) {
  return { ...item, scheduledDate: item.scheduledDate.toISOString() }
}

function serializeCampaign(c: {
  id: string; workspaceId: string; name: string; goal: string; targetAction: string
  startsAt: Date; endsAt: Date; status: string; createdAt: Date; updatedAt: Date
  contentPlan: null | { id: string; status: string; items: ReturnType<typeof serializeItem>[] }
}) {
  return {
    ...c,
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

export const campaignRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /campaigns
  app.get('/campaigns', {
    schema: { params: WorkspaceParams, response: { 200: CampaignListResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send({
      items: campaigns.map(c => serializeCampaign({
        ...c,
        contentPlan: c.contentPlan
          ? { ...c.contentPlan, items: c.contentPlan.items.map(serializeItem) }
          : null,
      })),
    })
  })

  // POST /campaigns
  app.post('/campaigns', {
    schema: { params: WorkspaceParams, body: CreateBody, response: { 201: CampaignResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { name, goal, targetAction, startsAt, endsAt } = request.body
    const campaign = await prisma.campaign.create({
      data: { workspaceId, name, goal, targetAction, startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
    })
    return reply.status(201).send(serializeCampaign({ ...campaign, contentPlan: null }))
  })

  // GET /campaigns/:campaignId
  app.get('/campaigns/:campaignId', {
    schema: { params: CampaignParams, response: { 200: CampaignResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse } },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' } } } } },
    })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })
    return reply.send(serializeCampaign({
      ...campaign,
      contentPlan: campaign.contentPlan
        ? { ...campaign.contentPlan, items: campaign.contentPlan.items.map(serializeItem) }
        : null,
    }))
  })

  // POST /campaigns/:campaignId/content-plan/generate
  app.post('/campaigns/:campaignId/content-plan/generate', {
    schema: {
      params: CampaignParams,
      response: { 200: ContentPlanResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const portrait = await prisma.companyPortrait.findUnique({ where: { workspaceId } })
    if (!portrait) return reply.status(400).send({ error: 'Company portrait not found. Run onboarding first.' })

    const items = await generateContentPlan(workspaceId, {
      portrait: {
        niche: portrait.niche,
        description: portrait.description,
        usp: portrait.usp,
        targetAudience: portrait.targetAudience,
        competitors: portrait.competitors,
        contentAngles: portrait.contentAngles,
      },
      goal: campaign.goal as 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH',
      targetAction: campaign.targetAction,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
    })

    const plan = await prisma.$transaction(async (tx) => {
      // Delete existing plan if regenerating
      const existing = await tx.contentPlan.findUnique({ where: { campaignId } })
      if (existing) {
        await tx.contentPlan.delete({ where: { campaignId } })
      }

      return tx.contentPlan.create({
        data: {
          campaignId,
          items: {
            create: items.map(item => ({
              index: item.index,
              topic: item.topic,
              format: item.format,
              scheduledDate: new Date(item.scheduledDate),
              hook: item.hook,
            })),
          },
        },
        include: { items: { orderBy: { index: 'asc' } } },
      })
    })

    return reply.send({ ...plan, items: plan.items.map(serializeItem) })
  })

  // POST /campaigns/:campaignId/approve-plan
  app.post('/campaigns/:campaignId/approve-plan', {
    schema: {
      params: CampaignParams,
      response: { 202: z.object({ message: z.string() }), 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const plan = await prisma.contentPlan.findUnique({ where: { campaignId }, include: { items: true } })
    if (!plan) return reply.status(400).send({ error: 'Generate a content plan first.' })
    if (plan.status !== 'DRAFT') return reply.status(400).send({ error: `Plan is already ${plan.status}` })

    await prisma.contentPlan.update({ where: { campaignId }, data: { status: 'APPROVED' } })
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE' } })

    const queue = getCampaignProducerQueue()
    await queue.add('produce', { campaignId, workspaceId })

    return reply.status(202).send({ message: 'Content plan approved. Video production started.' })
  })

  // PUT /campaigns/:campaignId/items/:itemId/approve
  app.put('/campaigns/:campaignId/items/:itemId/approve', {
    schema: {
      params: ItemParams,
      response: { 200: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('CLIENT', 'APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.status !== 'CLIENT_REVIEW') return reply.status(400).send({ error: `Item status is ${item.status}, expected CLIENT_REVIEW` })

    const approved = await prisma.contentPlanItem.update({
      where: { id: itemId },
      data: { status: 'APPROVED' },
    })

    // Schedule publication if script + socialAccount available
    if (approved.scriptId) {
      const socialAccount = await prisma.socialAccount.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
      })
      if (socialAccount) {
        const pub = await prisma.publication.create({
          data: {
            workspaceId,
            scriptId: approved.scriptId,
            socialAccountId: socialAccount.id,
            scheduledAt: approved.scheduledDate,
            renderJobId: null,
          },
        })
        const published = await prisma.contentPlanItem.update({
          where: { id: itemId },
          data: { publicationId: pub.id, status: 'PUBLISHED' },
        })
        return reply.send(serializeItem(published))
      }
    }

    return reply.send(serializeItem(approved))
  })

  // PUT /campaigns/:campaignId/items/:itemId/reject
  app.put('/campaigns/:campaignId/items/:itemId/reject', {
    schema: {
      params: ItemParams,
      body: RejectBody,
      response: { 200: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireRole('CLIENT', 'APPROVER', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params
    const { comment } = request.body

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.status !== 'CLIENT_REVIEW') return reply.status(400).send({ error: `Item status is ${item.status}` })

    const updated = await prisma.contentPlanItem.update({
      where: { id: itemId },
      data: { status: 'REJECTED', rejectComment: comment },
    })

    return reply.send(serializeItem(updated))
  })
}
