import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { getHooksEvolveQueue } from '../queue.js'
import { requireRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string().min(1).max(64).regex(/^[a-z0-9]+$/) })
const ErrorResponse = z.object({ error: z.string() })

export const hooksEvolveRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/hooks/evolve', {
    schema: {
      params: WorkspaceParams,
      response: {
        202: z.object({ jobId: z.string() }),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireRole('EDITOR', 'ADMIN', 'OWNER')],
  }, async (request, reply) => {
    const { workspaceId } = request.params
    const queue = getHooksEvolveQueue()
    const job = await queue.add('evolve', { workspaceId })
    const jobId = job.id
    if (!jobId) throw new Error('Failed to create job')
    return reply.status(202).send({ jobId })
  })
}
