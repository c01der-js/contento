import type { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@contento/db'
import type { MembershipRole } from '@contento/db'

// Role hierarchy weight — higher = more permissions
const ROLE_WEIGHT: Record<MembershipRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  APPROVER: 60,
  EDITOR: 50,
  AUTHOR: 40,
  DESIGNER: 40,
  VIEWER: 20,
  CLIENT: 10,
}

export function requireRole(...roles: MembershipRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const workspaceId = (request.params as Record<string, string>)['workspaceId']
    if (!workspaceId) {
      return reply.status(400).send({ error: 'Missing workspaceId' })
    }

    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: request.authUser.userId,
        },
      },
    })

    if (!membership) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    if (!roles.includes(membership.role)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}

/**
 * Require minimum role by weight.
 * Useful for "EDITOR or above" checks without enumerating all roles.
 */
export function requireMinRole(minRole: MembershipRole) {
  const minWeight = ROLE_WEIGHT[minRole]
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const workspaceId = (request.params as Record<string, string>)['workspaceId']
    if (!workspaceId) {
      return reply.status(400).send({ error: 'Missing workspaceId' })
    }

    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: request.authUser.userId,
        },
      },
    })

    if (!membership) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const userWeight = ROLE_WEIGHT[membership.role] ?? 0
    if (userWeight < minWeight) {
      return reply.status(403).send({ error: 'Forbidden' })
    }
  }
}

/**
 * requireApprovalRole — only APPROVER, ADMIN, OWNER can approve/reject.
 * DESIGNER and EDITOR cannot call approval endpoints.
 */
export const requireApprovalRole = requireRole('APPROVER', 'ADMIN', 'OWNER')

/**
 * requireReadRole — all roles can read (CLIENT is read-only).
 */
export const requireReadRole = requireRole(
  'OWNER', 'ADMIN', 'APPROVER', 'EDITOR', 'AUTHOR', 'DESIGNER', 'VIEWER', 'CLIENT',
)

/**
 * requireWriteRole — roles that can mutate content (not CLIENT or VIEWER).
 */
export const requireWriteRole = requireRole(
  'OWNER', 'ADMIN', 'APPROVER', 'EDITOR', 'AUTHOR', 'DESIGNER',
)
