import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireReadRole, requireWriteRole } from '../middleware/rbac.js'
import {
  getPlatformProfile,
  platformProfileToRow,
  TARGET_PLATFORMS,
  type PlatformProfileRow,
} from '@contento/shared'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const PlatformParams = z.object({ workspaceId: z.string(), platform: z.string() })
const ErrorResponse = z.object({ error: z.string() })

// Editable per-platform fields (the flattened PlatformProfile, minus aigcDisclosure which is
// always true). Bounds keep the editor honest.
const ProfileFields = z.object({
  targetDurationMinSec: z.number().int().min(1).max(600),
  targetDurationIdealSec: z.number().int().min(1).max(600),
  targetDurationMaxSec: z.number().int().min(1).max(600),
  hookWindowSec: z.number().int().min(1).max(60),
  captionStyle: z.enum(['seo-keyword-first', 'conversational-trend']),
  hashtagCount: z.number().int().min(0).max(30),
  captionMaxLen: z.number().int().min(1).max(5000),
  nativeSoundImportance: z.enum(['high', 'low']),
  formatAvatar: z.number().min(0).max(1),
  formatBroll: z.number().min(0).max(1),
  formatScreencast: z.number().min(0).max(1),
})

const ProfileResponse = ProfileFields.extend({
  platform: z.string(),
  customized: z.boolean(), // true = a per-workspace override row exists; false = static default
})
const ListResponse = z.object({ profiles: z.array(ProfileResponse) })

function toResponse(row: PlatformProfileRow, customized: boolean) {
  return {
    platform: row.platform,
    targetDurationMinSec: row.targetDurationMinSec,
    targetDurationIdealSec: row.targetDurationIdealSec,
    targetDurationMaxSec: row.targetDurationMaxSec,
    hookWindowSec: row.hookWindowSec,
    captionStyle: row.captionStyle as 'seo-keyword-first' | 'conversational-trend',
    hashtagCount: row.hashtagCount,
    captionMaxLen: row.captionMaxLen,
    nativeSoundImportance: row.nativeSoundImportance as 'high' | 'low',
    formatAvatar: row.formatAvatar,
    formatBroll: row.formatBroll,
    formatScreencast: row.formatScreencast,
    customized,
  }
}

function defaultResponse(platform: string) {
  return toResponse(platformProfileToRow(getPlatformProfile(platform)), false)
}

function validate(body: z.infer<typeof ProfileFields>): string | null {
  if (!(body.targetDurationMinSec <= body.targetDurationIdealSec && body.targetDurationIdealSec <= body.targetDurationMaxSec)) {
    return 'Duration must satisfy min <= ideal <= max'
  }
  const sum = body.formatAvatar + body.formatBroll + body.formatScreencast
  if (Math.abs(sum - 1) > 0.011) return 'formatMix weights (avatar + broll + screencast) must sum to 1'
  return null
}

export const platformProfileRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /platform-profiles — all target platforms, override row if present else static default.
  app.get('/platform-profiles', {
    schema: {
      params: WorkspaceParams,
      response: { 200: ListResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const rows = await prisma.platformProfile.findMany({ where: { workspaceId } })
    const byPlatform = new Map(rows.map((r) => [r.platform, r]))
    const profiles = TARGET_PLATFORMS.map((platform) => {
      const row = byPlatform.get(platform)
      return row ? toResponse(row as PlatformProfileRow, true) : defaultResponse(platform)
    })
    return reply.status(200).send({ profiles })
  })

  // PUT /platform-profiles/:platform — upsert a per-workspace override.
  app.put('/platform-profiles/:platform', {
    schema: {
      params: PlatformParams,
      body: ProfileFields,
      response: { 200: ProfileResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, platform } = request.params
    if (!(TARGET_PLATFORMS as string[]).includes(platform)) {
      return reply.status(400).send({ error: `Unknown platform '${platform}'` })
    }
    const err = validate(request.body)
    if (err) return reply.status(400).send({ error: err })

    const row = await prisma.platformProfile.upsert({
      where: { workspaceId_platform: { workspaceId, platform } },
      create: { workspaceId, platform, ...request.body },
      update: { ...request.body },
    })
    return reply.status(200).send(toResponse(row as PlatformProfileRow, true))
  })

  // DELETE /platform-profiles/:platform — reset to the static default.
  app.delete('/platform-profiles/:platform', {
    schema: {
      params: PlatformParams,
      response: { 200: ProfileResponse, 401: ErrorResponse, 403: ErrorResponse },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, platform } = request.params
    await prisma.platformProfile.deleteMany({ where: { workspaceId, platform } })
    return reply.status(200).send(defaultResponse(platform))
  })
}
