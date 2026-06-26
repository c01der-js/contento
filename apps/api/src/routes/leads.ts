import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '@contento/db'
import { requireReadRole, requireWriteRole } from '../middleware/rbac.js'

const WorkspaceParams = z.object({ workspaceId: z.string() })
const LeadParams = z.object({ workspaceId: z.string(), leadId: z.string() })
const ErrorResponse = z.object({ error: z.string() })

const LeadStatus = z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'LOST'])

// List-item shape (also returned by PATCH)
const LeadListItem = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  intent: z.string(),
  status: LeadStatus,
  createdAt: z.string(),
  conversationId: z.string(),
})

const MessageItem = z.object({
  role: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

const ConversationDetail = z.object({
  id: z.string(),
  senderName: z.string().nullable(),
  detectedIntent: z.string().nullable(),
  igThreadId: z.string(),
  messages: z.array(MessageItem),
})

// Detail shape
const LeadDetail = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  intent: z.string(),
  status: LeadStatus,
  notes: z.string().nullable(),
  createdAt: z.string(),
  conversation: ConversationDetail,
})

const PatchBody = z.object({ status: LeadStatus })

export const leadsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /leads — list all leads in workspace, newest-first
  app.get('/leads', {
    schema: {
      params: WorkspaceParams,
      response: {
        200: z.array(LeadListItem),
        401: ErrorResponse,
        403: ErrorResponse,
      },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId } = request.params

    const leads = await prisma.lead.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    })

    return reply.status(200).send(
      leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        intent: lead.intent,
        status: lead.status as z.infer<typeof LeadStatus>,
        createdAt: lead.createdAt.toISOString(),
        conversationId: lead.conversationId,
      })),
    )
  })

  // GET /leads/:leadId — detail with conversation + messages
  app.get('/leads/:leadId', {
    schema: {
      params: LeadParams,
      response: {
        200: LeadDetail,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireReadRole],
  }, async (request, reply) => {
    const { workspaceId, leadId } = request.params

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: {
        conversation: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })

    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    return reply.status(200).send({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      intent: lead.intent,
      status: lead.status as z.infer<typeof LeadStatus>,
      notes: lead.notes ?? null,
      createdAt: lead.createdAt.toISOString(),
      conversation: {
        id: lead.conversation.id,
        senderName: lead.conversation.senderName ?? null,
        detectedIntent: lead.conversation.detectedIntent ?? null,
        igThreadId: lead.conversation.igThreadId,
        messages: lead.conversation.messages.map((msg) => ({
          role: msg.role,
          text: msg.text,
          createdAt: msg.createdAt.toISOString(),
        })),
      },
    })
  })

  // PATCH /leads/:leadId — update status, return list-item shape
  app.patch('/leads/:leadId', {
    schema: {
      params: LeadParams,
      body: PatchBody,
      response: {
        200: LeadListItem,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
    preHandler: [requireWriteRole],
  }, async (request, reply) => {
    const { workspaceId, leadId } = request.params
    const { status } = request.body

    // Verify the lead belongs to this workspace before updating
    const existing = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Lead not found' })
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: { status },
    })

    return reply.status(200).send({
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      intent: updated.intent,
      status: updated.status as z.infer<typeof LeadStatus>,
      createdAt: updated.createdAt.toISOString(),
      conversationId: updated.conversationId,
    })
  })
}
