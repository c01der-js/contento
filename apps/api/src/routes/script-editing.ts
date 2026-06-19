import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import type { Prisma } from '@contento/db'
import { writeScript, convertFormat } from '@contento/ai'
import { buildBrandContext } from '@contento/ai'
import { requireRole } from '../middleware/rbac.js'

const ErrorResponse = z.object({ error: z.string() })

const ScriptParams = z.object({ workspaceId: z.string(), scriptId: z.string() })

// --- Script response schema (mirrors content.ts) ---
const ScriptResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ideaId: z.string().nullable(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  status: z.string(),
  submittedById: z.string().nullable(),
  brandCheckScore: z.number().nullable(),
  brandCheckNotes: z.string().nullable(),
  brandCheckCriteria: z.unknown().nullable(),
  autoFixes: z.unknown().nullable(),
  parentId: z.string().nullable(),
  version: z.number(),
  lengthVariant: z.enum(['SHORT', 'LONG']).nullable(),
  hasTts: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const ScriptVersionResponse = z.object({
  id: z.string(),
  scriptId: z.string(),
  version: z.number(),
  hook: z.string(),
  body: z.string(),
  cta: z.string(),
  captions: z.unknown().nullable(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
})

// --- Body schemas ---
const PatchScriptBody = z.object({
  hook: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  cta: z.string().min(1).optional(),
  captions: z.record(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'BRAND_CHECKED', 'APPROVED', 'PUBLISHED', 'IN_REVIEW', 'REJECTED', 'SCHEDULED']).optional(),
})

const RegenerateScriptBody = z.object({
  feedback: z.string().optional(),
  lengthVariant: z.enum(['SHORT', 'LONG']).optional(),
})

const DiffQuerystring = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
})

const ConvertScriptBody = z.object({
  targetFormat: z.string().min(1),
})

// --- Serializers ---
function serializeScript(s: {
  id: string
  workspaceId: string
  ideaId: string | null
  hook: string
  body: string
  cta: string
  caption: string
  hashtags: string[]
  status: string
  submittedById: string | null
  brandCheckScore: number | null
  brandCheckNotes: string | null
  brandCheckCriteria: unknown
  parentId: string | null
  version: number
  lengthVariant: string | null
  hasTts: boolean | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    ideaId: s.ideaId,
    hook: s.hook,
    body: s.body,
    cta: s.cta,
    caption: s.caption,
    hashtags: s.hashtags,
    status: s.status,
    submittedById: s.submittedById,
    brandCheckScore: s.brandCheckScore,
    brandCheckNotes: s.brandCheckNotes,
    brandCheckCriteria: s.brandCheckCriteria ?? null,
    autoFixes: null,
    parentId: s.parentId,
    version: s.version,
    lengthVariant: (s.lengthVariant ?? null) as 'SHORT' | 'LONG' | null,
    hasTts: s.hasTts,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

function serializeScriptVersion(v: {
  id: string
  scriptId: string
  version: number
  hook: string
  body: string
  cta: string
  captions: unknown
  createdAt: Date
  createdById: string | null
}) {
  return {
    id: v.id,
    scriptId: v.scriptId,
    version: v.version,
    hook: v.hook,
    body: v.body,
    cta: v.cta,
    captions: v.captions ?? null,
    createdAt: v.createdAt.toISOString(),
    createdById: v.createdById,
  }
}

export const scriptEditingRoutes: FastifyPluginAsyncZod = async (app) => {
  // =====================
  // PATCH /scripts/:scriptId — edit a script, saving prior state as a version
  // =====================
  app.patch('/scripts/:scriptId', {
    schema: {
      params: ScriptParams,
      body: PatchScriptBody,
      response: {
        200: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { hook, body, cta, captions, hashtags, status } = request.body
    const userId = request.authUser?.userId

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    // Save current state as a ScriptVersion before updating
    await prisma.scriptVersion.create({
      data: {
        scriptId: script.id,
        version: script.version,
        hook: script.hook,
        body: script.body,
        cta: script.cta,
        ...(script.captions != null ? { captions: script.captions as Prisma.JsonObject } : {}),
        ...(userId != null ? { createdById: userId } : {}),
      },
    })

    const updated = await prisma.script.update({
      where: { id: scriptId },
      data: {
        ...(hook != null ? { hook } : {}),
        ...(body != null ? { body } : {}),
        ...(cta != null ? { cta } : {}),
        ...(captions != null ? { captions: captions as Prisma.JsonObject } : {}),
        ...(hashtags != null ? { hashtags } : {}),
        ...(status != null ? { status } : {}),
        version: { increment: 1 },
      },
    })

    // If transitioning to IN_REVIEW, notify all APPROVER/ADMIN/OWNER members
    if (status === 'IN_REVIEW') {
      const approvers = await prisma.membership.findMany({
        where: { workspaceId, role: { in: ['APPROVER', 'ADMIN', 'OWNER'] } },
      })
      await Promise.all(
        approvers.map((m) =>
          prisma.notification.create({
            data: {
              workspaceId,
              userId: m.userId,
              type: 'APPROVAL_NEEDED',
              title: 'Script needs review',
              body: updated.hook,
              entityType: 'script',
              entityId: scriptId,
            },
          }),
        ),
      )
    }

    return reply.status(200).send(serializeScript(updated))
  })

  // =====================
  // POST /scripts/:scriptId/regenerate — regenerate a new script version via AI
  // =====================
  app.post('/scripts/:scriptId/regenerate', {
    schema: {
      params: ScriptParams,
      body: RegenerateScriptBody,
      response: {
        201: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { feedback, lengthVariant } = request.body

    const parent = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!parent) return reply.status(404).send({ error: 'Not found' })

    // Load idea and trend for context
    const idea = parent.ideaId
      ? await prisma.idea.findUnique({ where: { id: parent.ideaId } })
      : null

    const angle = [
      idea?.angle ?? 'Create engaging social media content',
      feedback ? `\nFeedback to incorporate: ${feedback}` : '',
    ].join('')

    let contentScript: Awaited<ReturnType<typeof writeScript>>
    try {
      contentScript = await writeScript(workspaceId, {
        title: idea?.title ?? 'Content',
        angle,
        format: idea?.format ?? 'video',
        platform:
          (idea as { platform?: string; platforms?: string[] } | null)?.platform ??
          (idea as { platforms?: string[] } | null)?.platforms?.[0] ??
          'instagram',
      })
    } catch {
      return reply.status(500).send({ error: 'Script regeneration failed' })
    }

    const newScript = await prisma.script.create({
      data: {
        workspaceId,
        // No ideaId — avoids @@unique([ideaId]) constraint; link via parentId instead
        parentId: parent.id,
        version: parent.version + 1,
        hook: contentScript.hook,
        body: contentScript.body,
        cta: contentScript.cta,
        caption: contentScript.caption,
        hashtags: contentScript.hashtags,
        ...(lengthVariant != null ? { lengthVariant } : {}),
      },
    })

    return reply.status(201).send(serializeScript(newScript))
  })

  // =====================
  // GET /scripts/:scriptId/versions — list all versions of a script
  // =====================
  app.get('/scripts/:scriptId/versions', {
    schema: {
      params: ScriptParams,
      response: {
        200: z.array(ScriptVersionResponse),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    const versions = await prisma.scriptVersion.findMany({
      where: { scriptId },
      orderBy: { version: 'asc' },
    })

    return reply.status(200).send(versions.map(serializeScriptVersion))
  })

  // =====================
  // GET /scripts/:scriptId/diff — diff two versions of a script
  // =====================
  app.get('/scripts/:scriptId/diff', {
    schema: {
      params: ScriptParams,
      querystring: DiffQuerystring,
      response: {
        200: z.object({
          from: z.object({ version: z.number(), hook: z.string(), body: z.string(), cta: z.string() }),
          to: z.object({ version: z.number(), hook: z.string(), body: z.string(), cta: z.string() }),
          diff: z.object({
            hookChanged: z.boolean(),
            bodyChanged: z.boolean(),
            ctaChanged: z.boolean(),
          }),
        }),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('VIEWER', 'APPROVER', 'EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { from: fromVersion, to: toVersion } = request.query

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    // Helper: resolve a version number to its data.
    // The "current" version is the live script record; older ones are in ScriptVersion.
    const resolveVersion = async (v: number): Promise<{ version: number; hook: string; body: string; cta: string } | null> => {
      if (v === script.version) {
        return { version: script.version, hook: script.hook, body: script.body, cta: script.cta }
      }
      const sv = await prisma.scriptVersion.findFirst({ where: { scriptId, version: v } })
      if (!sv) return null
      return { version: sv.version, hook: sv.hook, body: sv.body, cta: sv.cta }
    }

    const [fromData, toData] = await Promise.all([resolveVersion(fromVersion), resolveVersion(toVersion)])

    if (!fromData) return reply.status(404).send({ error: `Version ${fromVersion} not found` })
    if (!toData) return reply.status(404).send({ error: `Version ${toVersion} not found` })

    return reply.status(200).send({
      from: fromData,
      to: toData,
      diff: {
        hookChanged: fromData.hook !== toData.hook,
        bodyChanged: fromData.body !== toData.body,
        ctaChanged: fromData.cta !== toData.cta,
      },
    })
  })

  // =====================
  // POST /scripts/:scriptId/convert — convert script to a different format
  // =====================
  app.post('/scripts/:scriptId/convert', {
    schema: {
      params: ScriptParams,
      body: ConvertScriptBody,
      response: {
        201: ScriptResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { targetFormat } = request.body

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Not found' })

    let brandContext: Awaited<ReturnType<typeof buildBrandContext>>
    try {
      brandContext = await buildBrandContext(workspaceId)
    } catch {
      return reply.status(500).send({ error: 'Failed to load brand context' })
    }

    let converted: Awaited<ReturnType<typeof convertFormat>>
    try {
      converted = await convertFormat(
        {
          hook: script.hook,
          body: script.body,
          cta: script.cta,
          ...(script.captions != null ? { captions: script.captions as Record<string, string> } : {}),
        },
        targetFormat,
        brandContext,
      )
    } catch {
      return reply.status(500).send({ error: 'Format conversion failed' })
    }

    const newScript = await prisma.script.create({
      data: {
        workspaceId,
        parentId: scriptId,
        version: 1,
        hook: converted.hook,
        body: converted.body,
        cta: converted.cta,
        caption: converted.captions?.['caption'] ?? script.caption,
        hashtags: script.hashtags,
        ...(converted.captions != null
          ? { captions: converted.captions as Prisma.JsonObject }
          : {}),
      },
    })

    return reply.status(201).send(serializeScript(newScript))
  })
}
