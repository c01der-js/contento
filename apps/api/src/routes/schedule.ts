import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import type { Prisma } from '@contento/db'
import { getBestPostingTimes } from '../services/best-time.js'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const PublicationParams = z.object({ workspaceId: z.string(), publicationId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const BestTimeResponse = z.array(
  z.object({
    hour: z.number(),
    avgER: z.number(),
    postCount: z.number(),
  }),
)

const PublicationResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scriptId: z.string(),
  socialAccountId: z.string(),
  renderJobId: z.string().nullable(),
  status: z.string(),
  platformPostId: z.string().nullable(),
  postUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  abVariantId: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  geotag: z.unknown().nullable(),
  taggedAccounts: z.unknown().nullable(),
  collaborators: z.unknown().nullable(),
  firstComment: z.string().nullable(),
  metrics: z.unknown().nullable(),
  publishedAt: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

function serializePublication(p: {
  id: string
  workspaceId: string
  scriptId: string
  socialAccountId: string
  renderJobId: string | null
  status: string
  platformPostId: string | null
  postUrl: string | null
  errorMessage: string | null
  abVariantId: string | null
  utmCampaign: string | null
  geotag: unknown
  taggedAccounts: unknown
  collaborators: unknown
  firstComment: string | null
  metrics: unknown
  publishedAt: Date | null
  scheduledAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    scriptId: p.scriptId,
    socialAccountId: p.socialAccountId,
    renderJobId: p.renderJobId,
    status: p.status,
    platformPostId: p.platformPostId,
    postUrl: p.postUrl,
    errorMessage: p.errorMessage,
    abVariantId: p.abVariantId,
    utmCampaign: p.utmCampaign,
    geotag: p.geotag ?? null,
    taggedAccounts: p.taggedAccounts ?? null,
    collaborators: p.collaborators ?? null,
    firstComment: p.firstComment,
    metrics: p.metrics ?? null,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve scheduledAt for the Nth script in a weekly spread
// ---------------------------------------------------------------------------

async function resolveScheduledAt(
  workspaceId: string,
  platform: string,
  startDate: Date,
  dayOffset: number,
): Promise<Date> {
  const scores = await getBestPostingTimes(workspaceId, platform)
  // Pick the top-scoring hour (first entry, already sorted by avgER desc)
  const topHour = scores[0]?.hour ?? 9

  const date = new Date(startDate)
  date.setUTCDate(date.getUTCDate() + dayOffset)
  date.setUTCHours(topHour, 0, 0, 0)
  return date
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/best-time?platform=...
  app.get('/best-time', {
    schema: {
      params: WorkspaceParams,
      querystring: z.object({ platform: z.string().optional() }),
      response: {
        200: BestTimeResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { platform } = request.query
    return getBestPostingTimes(workspaceId, platform ?? 'instagram')
  })

  // POST /workspaces/:workspaceId/schedule/week
  app.post('/schedule/week', {
    schema: {
      params: WorkspaceParams,
      body: z.object({
        startDate: z.string().datetime({ offset: true }).or(z.string().date()),
        scriptIds: z.array(z.string()).min(1).max(7),
      }),
      response: {
        201: z.object({ publicationIds: z.array(z.string()) }),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { startDate, scriptIds } = request.body

    // Resolve workspace's first social account for platform detection
    const firstSocialAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    })

    const platform = firstSocialAccount?.platform ?? 'instagram'
    const start = new Date(startDate)

    const publicationIds: string[] = []

    for (let i = 0; i < scriptIds.length; i++) {
      const scriptId = scriptIds[i]!

      // Check for existing pending publication to avoid duplicates
      const existing = await prisma.publication.findFirst({
        where: { workspaceId, scriptId, status: 'PENDING' },
      })
      if (existing) {
        publicationIds.push(existing.id)
        continue
      }

      // Resolve socialAccountId: prefer account linked to an existing publication for this script
      const linkedPublication = await prisma.publication.findFirst({
        where: { workspaceId, scriptId },
        orderBy: { createdAt: 'desc' },
        select: { socialAccountId: true },
      })
      const socialAccountId =
        linkedPublication?.socialAccountId ?? firstSocialAccount?.id

      if (!socialAccountId) {
        return reply.status(400).send({ error: `No social account found for workspace ${workspaceId}` })
      }

      const scheduledAt = await resolveScheduledAt(workspaceId, platform, start, i)

      const publication = await prisma.publication.create({
        data: {
          workspaceId,
          scriptId,
          socialAccountId,
          scheduledAt,
          status: 'PENDING',
        },
      })

      publicationIds.push(publication.id)
    }

    return reply.status(201).send({ publicationIds })
  })

  // PATCH /workspaces/:workspaceId/publications/:publicationId
  app.patch('/publications/:publicationId', {
    schema: {
      params: PublicationParams,
      body: z.object({
        scheduledAt: z.string().optional(),
        geotag: z.record(z.unknown()).optional(),
        taggedAccounts: z.record(z.unknown()).optional(),
        collaborators: z.record(z.unknown()).optional(),
        firstComment: z.string().optional(),
      }),
      response: {
        200: PublicationResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, publicationId } = request.params
    const { scheduledAt, geotag, taggedAccounts, collaborators, firstComment } = request.body

    const existing = await prisma.publication.findFirst({
      where: { id: publicationId, workspaceId },
    })
    if (!existing) return reply.status(404).send({ error: 'Not found' })

    const updated = await prisma.publication.update({
      where: { id: publicationId },
      data: {
        ...(scheduledAt != null ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(geotag != null ? { geotag: geotag as Prisma.JsonObject } : {}),
        ...(taggedAccounts != null ? { taggedAccounts: taggedAccounts as Prisma.JsonObject } : {}),
        ...(collaborators != null ? { collaborators: collaborators as Prisma.JsonObject } : {}),
        ...(firstComment != null ? { firstComment } : {}),
      },
    })

    return reply.status(200).send(serializePublication(updated))
  })

  // POST /workspaces/:workspaceId/publications/bulk-reschedule
  app.post('/publications/bulk-reschedule', {
    schema: {
      params: WorkspaceParams,
      body: z.object({
        publicationIds: z.array(z.string()).min(1),
        startDate: z.string().datetime({ offset: true }).or(z.string().date()),
      }),
      response: {
        200: z.object({ updated: z.number() }),
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const { publicationIds, startDate } = request.body

    // Resolve workspace platform once
    const firstSocialAccount = await prisma.socialAccount.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    })
    const platform = firstSocialAccount?.platform ?? 'instagram'
    const start = new Date(startDate)

    // Verify all publications belong to this workspace — reject the whole
    // batch if any id is missing or owned by another workspace, so callers
    // never get a silent partial reschedule.
    const publications = await prisma.publication.findMany({
      where: { id: { in: publicationIds }, workspaceId },
      select: { id: true },
    })

    if (publications.length !== publicationIds.length) {
      const found = new Set(publications.map((p) => p.id))
      const missing = publicationIds.filter((id) => !found.has(id))
      return reply.status(400).send({
        error: `Some publication ids do not belong to this workspace: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
      })
    }

    let updated = 0
    for (let i = 0; i < publications.length; i++) {
      const pub = publications[i]!
      const scheduledAt = await resolveScheduledAt(workspaceId, platform, start, i)
      await prisma.publication.update({
        where: { id: pub.id },
        data: { scheduledAt },
      })
      updated++
    }

    return reply.status(200).send({ updated })
  })
}
