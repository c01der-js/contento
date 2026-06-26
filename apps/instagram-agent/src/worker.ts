import { Worker, type Job } from 'bullmq'
import { Redis as IORedis } from 'ioredis'
import { prisma } from '@contento/db'
import { runSalesAgent } from '@contento/ai'
import { sendInstagramMessage } from '@contento/platforms'
import { sendTelegram } from '@contento/notifications'

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379'
const CONCURRENCY = Number(process.env['WORKER_CONCURRENCY'] ?? '4')
const WEB_BASE_URL = process.env['WEB_BASE_URL'] ?? process.env['APP_BASE_URL'] ?? ''

export interface InboundJob {
  igAccountId: string
  senderId: string
  messageId: string | null
  text: string
}

type Creds = Record<string, unknown>

/** Resolve which connected Instagram SocialAccount (and its workspace) owns this thread. */
async function resolveAccount(igAccountId: string) {
  const accounts = await prisma.socialAccount.findMany({ where: { platform: 'instagram' } })
  const matched = accounts.find((a) => {
    const c = a.credentials as Creds
    return [c['igUserId'], c['userId'], c['igId'], c['id'], c['pageId']]
      .filter((v) => v != null)
      .map(String)
      .includes(igAccountId)
  })
  if (matched) return matched
  // Single-account fallback (the common case: one Automost IG account). The OAuth connect flow
  // does not currently persist the IG account id, so for multi-account setups the connect flow
  // must store it (igUserId) for exact routing. Documented in the B2 spec.
  if (accounts.length === 1) return accounts[0] ?? null
  return null
}

function getAccessToken(creds: Creds): string | null {
  const t = creds['accessToken'] ?? creds['access_token']
  return typeof t === 'string' && t.length > 0 ? t : null
}

async function salesChatId(workspaceId: string): Promise<string | null> {
  const integ = await prisma.integration.findFirst({
    where: { workspaceId, type: 'SALES_TELEGRAM', enabled: true },
  })
  const cfg = (integ?.config ?? {}) as Creds
  const id = cfg['chatId']
  if (typeof id === 'string' && id) return id
  return process.env['SALES_TELEGRAM_CHAT_ID'] ?? null
}

async function salesKnowledgeBase(workspaceId: string): Promise<string | undefined> {
  const integ = await prisma.integration.findFirst({
    where: { workspaceId, type: 'SALES_KB', enabled: true },
  })
  const cfg = (integ?.config ?? {}) as Creds
  const text = cfg['text']
  return typeof text === 'string' && text ? text : undefined
}

function leadsLink(): string {
  return WEB_BASE_URL ? `${WEB_BASE_URL.replace(/\/$/, '')}/ru/leads` : ''
}

/**
 * Process one inbound Instagram DM: persist it, run the sales agent, reply on Instagram, update
 * qualification, and (on a qualified lead or an escalation) notify the Telegram sales chat.
 */
export async function handleInbound(data: InboundJob): Promise<void> {
  const { igAccountId, senderId, messageId, text } = data

  const account = await resolveAccount(igAccountId)
  if (!account) {
    console.warn(`[instagram-agent] no connected Instagram account for ${igAccountId}; dropping`)
    return
  }
  const workspaceId = account.workspaceId

  const conversation = await prisma.conversation.upsert({
    where: { workspaceId_igThreadId: { workspaceId, igThreadId: senderId } },
    create: { workspaceId, channel: 'INSTAGRAM_DM', igThreadId: senderId, socialAccountId: account.id },
    update: {},
  })

  // Idempotency: a duplicate webhook for the same Meta message id is a no-op.
  if (messageId) {
    const existing = await prisma.message.findFirst({
      where: { conversationId: conversation.id, externalId: messageId },
    })
    if (existing) return
  }

  try {
    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', text, externalId: messageId },
    })
  } catch (err) {
    // Unique (conversationId, externalId) violation from a racing duplicate — already recorded.
    if ((err as { code?: string }).code === 'P2002') return
    throw err
  }

  // A human has taken over this conversation — keep recording the transcript but do not auto-reply.
  if (conversation.escalated) return

  const history = (
    await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    })
  ).map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), text: m.text }))

  const knowledgeBase = await salesKnowledgeBase(workspaceId)
  const result = await runSalesAgent(workspaceId, { history, ...(knowledgeBase ? { knowledgeBase } : {}) })

  // Reply on Instagram (best-effort: a send failure must not lose the qualification state).
  const token = getAccessToken(account.credentials as Creds)
  if (token) {
    try {
      await sendInstagramMessage({ accessToken: token, recipientId: senderId, text: result.replyText })
    } catch (err) {
      console.error('[instagram-agent] Instagram send failed:', err)
    }
  } else {
    console.warn(`[instagram-agent] no access token on account ${account.id}; reply not sent`)
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: 'assistant', text: result.replyText },
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      detectedIntent: result.detectedIntent ?? conversation.detectedIntent,
      senderPhone: result.extractedPhone ?? conversation.senderPhone,
      qualification: result.qualification,
      escalated: result.needsEscalation || conversation.escalated,
    },
  })

  const chatId = await salesChatId(workspaceId)

  if (result.qualification === 'QUALIFIED' && result.extractedPhone && result.detectedIntent) {
    const lead = await prisma.lead.upsert({
      where: { conversationId: conversation.id },
      create: {
        workspaceId,
        conversationId: conversation.id,
        name: conversation.senderName ?? senderId,
        phone: result.extractedPhone,
        intent: result.detectedIntent,
      },
      update: { phone: result.extractedPhone, intent: result.detectedIntent },
    })
    if (chatId) {
      const link = leadsLink()
      const card = [
        '🟢 <b>Новый лид (Instagram)</b>',
        `Имя: ${lead.name}`,
        `Телефон: ${lead.phone}`,
        `Интент: ${lead.intent}`,
        link ? `Карточка: ${link}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      try {
        await sendTelegram(chatId, card)
      } catch (err) {
        console.error('[instagram-agent] Telegram lead notify failed:', err)
      }
    }
  } else if (result.needsEscalation && chatId) {
    const link = leadsLink()
    const msg = [
      '⚠️ <b>Эскалация диалога (Instagram)</b>',
      `Отправитель: ${conversation.senderName ?? senderId}`,
      `Сообщение: ${text}`,
      link ? `Открыть: ${link}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await sendTelegram(chatId, msg)
    } catch (err) {
      console.error('[instagram-agent] Telegram escalation notify failed:', err)
    }
  }
}

export function startWorker(): Worker {
  const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  return new Worker<InboundJob>(
    'instagram-dm',
    async (job: Job<InboundJob>) => {
      await handleInbound(job.data)
    },
    { connection, concurrency: CONCURRENCY },
  )
}
