import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import type { Prisma } from '@contento/db'
import { generateVariants, generateCoverVariants, buildBrandContext } from '@contento/ai'
import { requireRole } from '../middleware/rbac.js'

const ErrorResponse = z.object({ error: z.string() })

const ScriptAbParams = z.object({
  workspaceId: z.string(),
  scriptId: z.string(),
})

const AbTestParams = z.object({
  workspaceId: z.string(),
  testId: z.string(),
})

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const CoverConceptSchema = z.object({
  composition: z.string(),
  palette: z.array(z.string()),
  textOverlay: z.string(),
  imagePrompt: z.string(),
})

const AbVariantResponse = z.object({
  id: z.string(),
  testId: z.string(),
  label: z.string(),
  hook: z.string(),
  caption: z.string(),
  coverConcept: CoverConceptSchema.nullable(),
  createdAt: z.string(),
})

const AbTestResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  scriptId: z.string(),
  kind: z.enum(['TEXT', 'COVER']),
  status: z.string(),
  winnerId: z.string().nullable(),
  concludedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  variants: z.array(AbVariantResponse),
})

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function serializeVariant(v: {
  id: string
  testId: string
  label: string
  hook: string
  caption: string
  coverConcept?: Prisma.JsonValue
  createdAt: Date
}) {
  return {
    id: v.id,
    testId: v.testId,
    label: v.label,
    hook: v.hook,
    caption: v.caption,
    coverConcept: (v.coverConcept ?? null) as z.infer<typeof CoverConceptSchema> | null,
    createdAt: v.createdAt.toISOString(),
  }
}

function serializeTest(t: {
  id: string
  workspaceId: string
  scriptId: string
  status: string
  winnerId: string | null
  concludedAt: Date | null
  createdAt: Date
  updatedAt: Date
  variants: Array<{
    id: string
    testId: string
    label: string
    hook: string
    caption: string
    coverConcept?: Prisma.JsonValue
    createdAt: Date
  }>
}) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    scriptId: t.scriptId,
    kind: 'TEXT' as 'TEXT' | 'COVER',
    status: t.status,
    winnerId: t.winnerId,
    concludedAt: t.concludedAt ? t.concludedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    variants: t.variants.map(serializeVariant),
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const abTestRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /workspaces/:workspaceId/scripts/:scriptId/ab-test
  // Creates a text OR cover A/B test depending on `kind` (default: 'text')
  app.post('/scripts/:scriptId/ab-test', {
    schema: {
      params: ScriptAbParams,
      body: z.object({
        kind: z.enum(['text', 'cover']).default('text'),
        count: z.number().int().min(2).max(10).default(3),
      }),
      response: {
        201: AbTestResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { kind, count } = request.body

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Script not found' })

    if (kind === 'cover') {
      const brandContext = await buildBrandContext(workspaceId)
      let concepts: Awaited<ReturnType<typeof generateCoverVariants>>
      try {
        concepts = await generateCoverVariants(
          { hook: script.hook, body: script.body, cta: script.cta },
          brandContext,
          count,
        )
      } catch {
        return reply.status(500).send({ error: 'Cover variant generation failed' })
      }

      const test = await prisma.abTest.create({
        data: {
          workspaceId,
          scriptId,
          variants: {
            create: concepts.map((concept, i) => ({
              label: `Cover ${String.fromCharCode(65 + i)}`,
              hook: script.hook,
              caption: script.caption,
            })),
          },
        },
        include: { variants: true },
      })

      return reply.status(201).send(serializeTest(test))
    }

    // Default: text variant A/B test
    let generatedVariants: Awaited<ReturnType<typeof generateVariants>>
    try {
      generatedVariants = await generateVariants(workspaceId, {
        hook: script.hook,
        caption: script.caption,
      }, count - 1)
    } catch {
      return reply.status(500).send({ error: 'Text variant generation failed' })
    }

    const test = await prisma.abTest.create({
      data: {
        workspaceId,
        scriptId,
        variants: {
          create: [
            { label: 'A', hook: script.hook, caption: script.caption },
            ...generatedVariants.map((v) => ({ label: v.label, hook: v.hook, caption: v.caption })),
          ],
        },
      },
      include: { variants: true },
    })

    return reply.status(201).send(serializeTest(test))
  })

  // POST /workspaces/:workspaceId/scripts/:scriptId/ab-test/cover
  // Dedicated cover A/B test endpoint
  app.post('/scripts/:scriptId/ab-test/cover', {
    schema: {
      params: ScriptAbParams,
      body: z.object({
        count: z.number().int().min(2).max(10).default(3),
      }),
      response: {
        201: AbTestResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        500: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, scriptId } = request.params
    const { count } = request.body

    const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId } })
    if (!script) return reply.status(404).send({ error: 'Script not found' })

    const brandContext = await buildBrandContext(workspaceId)
    let concepts: Awaited<ReturnType<typeof generateCoverVariants>>
    try {
      concepts = await generateCoverVariants(
        { hook: script.hook, body: script.body, cta: script.cta },
        brandContext,
        count,
      )
    } catch {
      return reply.status(500).send({ error: 'Cover variant generation failed' })
    }

    const test = await prisma.abTest.create({
      data: {
        workspaceId,
        scriptId,
        variants: {
          create: concepts.map((concept, i) => ({
            label: `Cover ${String.fromCharCode(65 + i)}`,
            hook: script.hook,
            caption: script.caption,
          })),
        },
      },
      include: { variants: true },
    })

    return reply.status(201).send(serializeTest(test))
  })

  // GET /workspaces/:workspaceId/scripts/:scriptId/ab-tests
  app.get('/scripts/:scriptId/ab-tests', {
    schema: {
      params: ScriptAbParams,
      response: {
        200: z.array(AbTestResponse),
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

    const tests = await prisma.abTest.findMany({
      where: { scriptId, workspaceId },
      include: { variants: true },
      orderBy: { createdAt: 'desc' },
    })

    return reply.status(200).send(tests.map(serializeTest))
  })

  // POST /workspaces/:workspaceId/ab-tests/:testId/conclude
  app.post('/ab-tests/:testId/conclude', {
    schema: {
      params: AbTestParams,
      body: z.object({ winnerId: z.string() }),
      response: {
        200: AbTestResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId, testId } = request.params
    const { winnerId } = request.body

    const test = await prisma.abTest.findFirst({
      where: { id: testId, workspaceId },
      include: { variants: true },
    })
    if (!test) return reply.status(404).send({ error: 'Not found' })
    if (test.status === 'CONCLUDED') return reply.status(400).send({ error: 'Test already concluded' })

    const variantIds = (test.variants as Array<{ id: string }>).map((v) => v.id)
    if (!variantIds.includes(winnerId)) {
      return reply.status(400).send({ error: 'winnerId does not belong to this test' })
    }

    const updated = await prisma.abTest.update({
      where: { id: testId },
      data: { status: 'CONCLUDED', winnerId, concludedAt: new Date() },
      include: { variants: true },
    })

    return reply.status(200).send(serializeTest(updated))
  })
}
