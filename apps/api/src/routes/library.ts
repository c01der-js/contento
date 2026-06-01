import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// ── Published library schemas ─────────────────────────────────────────────────

const PublishedItemResponse = z.object({
  id: z.string(),
  scriptId: z.string(),
  platform: z.string(),
  accountName: z.string(),
  hook: z.string(),
  body: z.string(),
  publishedAt: z.string().nullable(),
  reach: z.number().nullable(),
  er: z.number().nullable(),
})

const PublishedQuerystring = z.object({
  q: z.string().optional(),
  platform: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  minER: z.coerce.number().min(0).optional(),
  pillarId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const PublishedListResponse = z.object({
  publications: z.array(PublishedItemResponse),
  nextCursor: z.string().nullable(),
})

// ── Similar scripts schemas ───────────────────────────────────────────────────

const SimilarScriptResponse = z.object({
  id: z.string(),
  hook: z.string(),
  body: z.string(),
  similarity: z.number(),
})

const SimilarParams = z.object({ workspaceId: z.string(), id: z.string() })

// ── Routes ────────────────────────────────────────────────────────────────────

export const libraryRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /workspaces/:workspaceId/library/published
  app.get('/library/published', {
    schema: {
      params: WorkspaceParams,
      querystring: PublishedQuerystring,
      response: {
        200: PublishedListResponse,
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request) => {
    const { workspaceId } = request.params
    const { q, platform, from, to, minER, pillarId, cursor, limit } = request.query

    const publications = await prisma.publication.findMany({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        ...(platform ? { socialAccount: { platform } } : {}),
        ...(from || to
          ? {
              publishedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(pillarId ? { script: { idea: { pillarId: pillarId } } } : {}),
        ...(q
          ? {
              script: {
                OR: [
                  { hook: { contains: q, mode: 'insensitive' } },
                  { body: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: {
        script: { select: { hook: true, body: true } },
        socialAccount: { select: { platform: true, name: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    })

    // Apply minER in-memory — metrics is an untyped JSON column
    const filtered =
      minER !== undefined
        ? publications.filter((p) => {
            const metrics = p.metrics as Record<string, unknown> | null
            if (!metrics) return false
            const er = parseFloat(String(metrics['er'] ?? ''))
            return Number.isFinite(er) && er >= minER
          })
        : publications

    const hasMore = filtered.length > limit
    const page = hasMore ? filtered.slice(0, limit) : filtered
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null

    return {
      publications: page.map((p) => {
        const metrics = p.metrics as Record<string, unknown> | null
        const reach = metrics?.['reach'] !== undefined ? Number(metrics['reach']) : null
        const er = metrics?.['er'] !== undefined ? Number(metrics['er']) : null
        return {
          id: p.id,
          scriptId: p.scriptId,
          platform: p.socialAccount.platform,
          accountName: p.socialAccount.name,
          hook: p.script.hook,
          body: p.script.body,
          publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          reach: Number.isFinite(reach) ? reach : null,
          er: Number.isFinite(er) ? er : null,
        }
      }),
      nextCursor,
    }
  })

  // GET /workspaces/:workspaceId/scripts/:id/similar
  app.get('/scripts/:id/similar', {
    schema: {
      params: SimilarParams,
      response: {
        200: z.array(SimilarScriptResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, id } = request.params

    // Load target script embedding via raw query (Unsupported vector type)
    type EmbeddingRow = { id: string; embedding: string | null }
    const rows = await prisma.$queryRaw<EmbeddingRow[]>`
      SELECT id, embedding::text AS embedding
      FROM "Script"
      WHERE id = ${id} AND "workspaceId" = ${workspaceId}
      LIMIT 1
    `

    if (!rows.length) {
      return reply.status(404).send({ error: 'Script not found' })
    }

    const target = rows[0]!
    if (!target.embedding) {
      // No embedding yet — return empty list gracefully
      return []
    }

    type SimilarRow = { id: string; hook: string; body: string; similarity: number }
    const similar = await prisma.$queryRaw<SimilarRow[]>`
      SELECT id, hook, body,
             1 - (embedding <=> ${target.embedding}::vector) AS similarity
      FROM "Script"
      WHERE "workspaceId" = ${workspaceId}
        AND id != ${id}
        AND embedding IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 5
    `

    return similar.map((s) => ({
      id: s.id,
      hook: s.hook,
      body: s.body,
      similarity: Number(s.similarity),
    }))
  })
}
