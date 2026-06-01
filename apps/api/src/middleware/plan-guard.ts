import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@contento/db'

export async function checkSeatLimit(request: FastifyRequest, reply: FastifyReply) {
  const workspaceId = (request.params as Record<string, string>)['workspaceId']
  if (!workspaceId) return

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })
  if (!workspace) return

  const seatCount = await prisma.membership.count({ where: { workspaceId } })
  if (seatCount >= workspace.maxSeats) {
    return reply.status(403).send({ error: `Workspace seat limit reached (${workspace.maxSeats})` })
  }
}
