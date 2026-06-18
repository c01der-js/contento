import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireWriteRole, requireReadRole, requireRole } from '../middleware/rbac.js'
import { generateContentPlan } from '@contento/ai'
import { TARGET_PLATFORMS } from '@contento/shared'
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
  platform: z.string().nullable(),
  scheduledDate: z.string(),
  hook: z.string(),
  status: z.string(),
  rejectComment: z.string().nullable(),
  scriptId: z.string().nullable(),
  videoJobId: z.string().nullable(),
  publicationId: z.string().nullable(),
  qaStatus: z.enum(['PASS', 'WARN', 'BLOCK']).nullable(),
  qaFindings: z.array(z.object({ id: z.string(), severity: z.string(), message: z.string() })).nullable(),
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
  targetPlatforms: z.array(z.string()),
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
  targetPlatforms: z.array(z.enum(['tiktok', 'instagram', 'youtube', 'telegram'])).min(1).optional(),
})

const RejectBody = z.object({ comment: z.string().min(1) })

// Accepts both date-only (YYYY-MM-DD, from <input type="date">) and full ISO
// strings, rejecting anything Date can't parse so bad input is a 400, not a 500.
const DateString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid date' })

const AddItemBody = z.object({
  topic: z.string().min(1),
  hook: z.string().min(1),
  format: z.string().min(1),
  scheduledDate: DateString,
})

const EditItemBody = z.object({
  topic: z.string().min(1).optional(),
  hook: z.string().min(1).optional(),
  format: z.string().min(1).optional(),
  scheduledDate: DateString.optional(),
})

const EditCampaignBody = z.object({
  name: z.string().min(1).optional(),
  goal: z.enum(['SUBSCRIBERS', 'SALES', 'ENGAGEMENT', 'REACH']).optional(),
  targetAction: z.string().min(1).optional(),
  startsAt: DateString.optional(),
  endsAt: DateString.optional(),
})

const OkResponse = z.object({ ok: z.boolean() })

function serializeItem(item: {
  id: string; index: number; topic: string; format: string; platform: string | null; scheduledDate: Date
  hook: string; status: string; rejectComment: string | null
  scriptId: string | null; videoJobId: string | null; publicationId: string | null
  qaChecks?: Array<{ status: string; findings: unknown }>
}) {
  // Coerce platform to null (a Prisma String? is null in DB; older rows / partial
  // sources may omit it) so the nullable response schema always validates.
  const qa = item.qaChecks?.[0]
  return {
    ...item,
    platform: item.platform ?? null,
    scheduledDate: item.scheduledDate.toISOString(),
    qaStatus: (qa?.status as 'PASS' | 'WARN' | 'BLOCK' | undefined) ?? null,
    qaFindings: (qa?.findings as Array<{ id: string; severity: string; message: string }> | undefined) ?? null,
  }
}

function serializeCampaign(c: {
  id: string; workspaceId: string; name: string; goal: string; targetAction: string
  targetPlatforms: string[]
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

async function loadPlanResponse(campaignId: string) {
  const plan = await prisma.contentPlan.findUnique({
    where: { campaignId },
    include: { items: { orderBy: { index: 'asc' }, include: { qaChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
  })
  if (!plan) return null
  return { id: plan.id, status: plan.status, items: plan.items.map(serializeItem) }
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
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' }, include: { qaChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } } } } },
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
    const body = request.body
    const campaign = await prisma.campaign.create({
      data: { workspaceId, name, goal, targetAction, startsAt: new Date(startsAt), endsAt: new Date(endsAt), ...(body.targetPlatforms ? { targetPlatforms: body.targetPlatforms } : {}) },
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
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' }, include: { qaChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } } } } },
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

    // Fall back to the full platform set if the campaign predates the column or has an empty array.
    const platforms = campaign.targetPlatforms?.length ? campaign.targetPlatforms : TARGET_PLATFORMS

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
            create: items.flatMap((item) =>
              platforms.map((platform, pIdx) => ({
                index: item.index * platforms.length + pIdx,
                topic: item.topic,
                format: item.format,
                platform,
                scheduledDate: new Date(item.scheduledDate),
                hook: item.hook,
              })),
            ),
          },
        },
        include: { items: { orderBy: { index: 'asc' }, include: { qaChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
      })
    })

    return reply.send({ ...plan, items: plan.items.map(serializeItem) })
  })

  // POST /campaigns/:campaignId/approve-plan
  app.post('/campaigns/:campaignId/approve-plan', {
    schema: {
      params: CampaignParams,
      response: { 202: z.object({ message: z.string() }), 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const plan = await prisma.contentPlan.findUnique({ where: { campaignId }, include: { items: true } })
    if (!plan) return reply.status(400).send({ error: 'Generate a content plan first.' })
    if (plan.status !== 'DRAFT') return reply.status(400).send({ error: `Plan is already ${plan.status}` })

    // Atomic update — only succeeds if plan is still DRAFT (prevents race condition)
    const updated = await prisma.contentPlan.updateMany({
      where: { campaignId, status: 'DRAFT' },
      data: { status: 'APPROVED' },
    })
    if (updated.count === 0) return reply.status(409).send({ error: 'Plan was already approved by a concurrent request.' })

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

    // QA gate: a BLOCK verdict prevents approval. WARN/PASS (or no QA record) proceed.
    const latestQa = await prisma.qaCheck.findFirst({
      where: { contentPlanItemId: itemId },
      orderBy: { createdAt: 'desc' },
    })
    if (latestQa?.status === 'BLOCK') {
      return reply.status(400).send({ error: 'QA check blocked this item; regenerate or reject it.' })
    }

    const approved = await prisma.contentPlanItem.update({
      where: { id: itemId },
      data: { status: 'APPROVED' },
    })

    // Schedule publication if script + socialAccount available
    if (approved.scriptId) {
      const socialAccount = await prisma.socialAccount.findFirst({
        where: { workspaceId, ...(approved.platform ? { platform: approved.platform } : {}) },
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
            videoJobId: approved.videoJobId,
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

  // POST /campaigns/:campaignId/content-plan/stop — halt video generation
  app.post('/campaigns/:campaignId/content-plan/stop', {
    schema: {
      params: CampaignParams,
      response: { 200: ContentPlanResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    const plan = await prisma.contentPlan.findUnique({ where: { campaignId } })
    if (!plan) return reply.status(400).send({ error: 'No content plan to stop.' })

    // Revert the plan to DRAFT only if it is actively producing. The producer
    // checks the plan status each step and halts; reverting also re-enables editing.
    // Atomically: revert the plan to DRAFT (only if actively producing), reset
    // in-flight items to PENDING, and revert the campaign. videoJobId is kept so the
    // video-worker can detect and abort an already-enqueued render job for a reset item.
    const stopped = await prisma.$transaction(async (tx) => {
      const reverted = await tx.contentPlan.updateMany({
        where: { campaignId, status: { in: ['APPROVED', 'IN_PRODUCTION'] } },
        data: { status: 'DRAFT' },
      })
      if (reverted.count === 0) return false
      // Completed items (CLIENT_REVIEW/APPROVED/PUBLISHED) are left untouched.
      await tx.contentPlanItem.updateMany({
        where: {
          contentPlanId: plan.id,
          status: { in: ['PENDING', 'SCRIPTING', 'SCRIPTED', 'VIDEO_QUEUED', 'VIDEO_GENERATING'] },
        },
        data: { status: 'PENDING', rejectComment: null },
      })
      await tx.campaign.update({ where: { id: campaignId }, data: { status: 'DRAFT' } })
      return true
    })
    if (!stopped) return reply.status(400).send({ error: 'Generation is not running.' })

    const response = await loadPlanResponse(campaignId)
    return reply.send(response!)
  })

  // PATCH /campaigns/:campaignId — edit campaign criteria
  app.patch('/campaigns/:campaignId', {
    schema: {
      params: CampaignParams,
      body: EditCampaignBody,
      response: { 200: CampaignResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params
    const body = request.body

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { contentPlan: true },
    })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })
    if (campaign.contentPlan && ['APPROVED', 'IN_PRODUCTION'].includes(campaign.contentPlan.status)) {
      return reply.status(400).send({ error: 'Stop generation before editing the campaign.' })
    }

    const data: {
      name?: string
      goal?: 'SUBSCRIBERS' | 'SALES' | 'ENGAGEMENT' | 'REACH'
      targetAction?: string
      startsAt?: Date
      endsAt?: Date
    } = {}
    if (body.name !== undefined) data.name = body.name
    if (body.goal !== undefined) data.goal = body.goal
    if (body.targetAction !== undefined) data.targetAction = body.targetAction
    if (body.startsAt !== undefined) data.startsAt = new Date(body.startsAt)
    if (body.endsAt !== undefined) data.endsAt = new Date(body.endsAt)

    await prisma.campaign.update({ where: { id: campaignId }, data })

    const updated = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { contentPlan: { include: { items: { orderBy: { index: 'asc' }, include: { qaChecks: { orderBy: { createdAt: 'desc' }, take: 1 } } } } } },
    })
    return reply.send(serializeCampaign({
      ...updated!,
      contentPlan: updated!.contentPlan
        ? { ...updated!.contentPlan, items: updated!.contentPlan.items.map(serializeItem) }
        : null,
    }))
  })

  // POST /campaigns/:campaignId/content-plan/items — add a plan item
  app.post('/campaigns/:campaignId/content-plan/items', {
    schema: {
      params: CampaignParams,
      body: AddItemBody,
      response: { 201: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId } = request.params
    const { topic, hook, format, scheduledDate } = request.body

    const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
    if (!campaign) return reply.status(404).send({ error: 'Campaign not found' })

    let plan = await prisma.contentPlan.findUnique({ where: { campaignId } })
    if (plan && plan.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Plan can only be edited in DRAFT. Stop generation first.' })
    }
    // upsert (not create) guards against a P2002 race on the unique campaignId when
    // two "add first video" requests arrive concurrently.
    if (!plan) plan = await prisma.contentPlan.upsert({ where: { campaignId }, update: {}, create: { campaignId } })

    const max = await prisma.contentPlanItem.aggregate({
      where: { contentPlanId: plan.id },
      _max: { index: true },
    })
    const index = (max._max.index ?? -1) + 1

    const item = await prisma.contentPlanItem.create({
      data: { contentPlanId: plan.id, index, topic, hook, format, scheduledDate: new Date(scheduledDate) },
    })

    return reply.status(201).send(serializeItem(item))
  })

  // PATCH /campaigns/:campaignId/items/:itemId — edit a plan item
  app.patch('/campaigns/:campaignId/items/:itemId', {
    schema: {
      params: ItemParams,
      body: EditItemBody,
      response: { 200: ContentPlanItemResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params
    const body = request.body

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
      include: { contentPlan: { select: { status: true } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.contentPlan.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Plan can only be edited in DRAFT. Stop generation first.' })
    }
    // Only pending items are content-editable. An already-produced item (kept after a
    // Stop) would not regenerate on re-approval, so editing it would silently no-op.
    if (item.status !== 'PENDING') {
      return reply.status(400).send({ error: 'This video is already produced — delete and re-add it to change it.' })
    }

    const data: { topic?: string; hook?: string; format?: string; scheduledDate?: Date } = {}
    if (body.topic !== undefined) data.topic = body.topic
    if (body.hook !== undefined) data.hook = body.hook
    if (body.format !== undefined) data.format = body.format
    if (body.scheduledDate !== undefined) data.scheduledDate = new Date(body.scheduledDate)

    const updated = await prisma.contentPlanItem.update({ where: { id: itemId }, data })
    return reply.send(serializeItem(updated))
  })

  // DELETE /campaigns/:campaignId/items/:itemId — remove a plan item
  app.delete('/campaigns/:campaignId/items/:itemId', {
    schema: {
      params: ItemParams,
      response: { 200: OkResponse, 400: ErrorResponse, 404: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, campaignId, itemId } = request.params

    const item = await prisma.contentPlanItem.findFirst({
      where: { id: itemId, contentPlan: { campaignId, campaign: { workspaceId } } },
      include: { contentPlan: { select: { id: true, status: true } } },
    })
    if (!item) return reply.status(404).send({ error: 'Item not found' })
    if (item.contentPlan.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Plan can only be edited in DRAFT. Stop generation first.' })
    }

    const planId = item.contentPlan.id
    await prisma.$transaction(async (tx) => {
      await tx.contentPlanItem.delete({ where: { id: itemId } })
      // Re-index remaining items to keep numbering contiguous
      const rest = await tx.contentPlanItem.findMany({
        where: { contentPlanId: planId },
        orderBy: { index: 'asc' },
        select: { id: true },
      })
      await Promise.all(rest.map((r, i) =>
        tx.contentPlanItem.update({ where: { id: r.id }, data: { index: i } }),
      ))
    })

    return reply.send({ ok: true })
  })
}
