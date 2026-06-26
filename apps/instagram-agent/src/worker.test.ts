import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above imports; create all mock fns via vi.hoisted() so they are available
// at mock-factory evaluation time.
const {
  mockSocialAccountFindMany,
  mockConversationUpsert,
  mockMessageFindFirst,
  mockMessageCreate,
  mockMessageFindMany,
  mockConversationUpdate,
  mockLeadUpsert,
  mockIntegrationFindFirst,
  mockRunSalesAgent,
  mockSendInstagramMessage,
  mockSendTelegram,
} = vi.hoisted(() => ({
  mockSocialAccountFindMany: vi.fn(),
  mockConversationUpsert: vi.fn(),
  mockMessageFindFirst: vi.fn(),
  mockMessageCreate: vi.fn(),
  mockMessageFindMany: vi.fn(),
  mockConversationUpdate: vi.fn(),
  mockLeadUpsert: vi.fn(),
  mockIntegrationFindFirst: vi.fn(),
  mockRunSalesAgent: vi.fn(),
  mockSendInstagramMessage: vi.fn(),
  mockSendTelegram: vi.fn(),
}))

vi.mock('bullmq', () => ({ Worker: class {}, Queue: class {} }))
vi.mock('ioredis', () => ({ Redis: class {} }))

vi.mock('@contento/db', () => ({
  prisma: {
    socialAccount: { findMany: mockSocialAccountFindMany },
    conversation: { upsert: mockConversationUpsert, update: mockConversationUpdate },
    message: {
      findFirst: mockMessageFindFirst,
      create: mockMessageCreate,
      findMany: mockMessageFindMany,
    },
    lead: { upsert: mockLeadUpsert },
    integration: { findFirst: mockIntegrationFindFirst },
  },
}))

vi.mock('@contento/ai', () => ({ runSalesAgent: mockRunSalesAgent }))
vi.mock('@contento/platforms', () => ({ sendInstagramMessage: mockSendInstagramMessage }))
vi.mock('@contento/notifications', () => ({ sendTelegram: mockSendTelegram }))

import { handleInbound } from './worker.js'

// ─── shared default return values ────────────────────────────────────────────

const DEFAULT_ACCOUNT = {
  id: 'sa1',
  workspaceId: 'ws1',
  platform: 'instagram',
  credentials: { access_token: 'tok', igUserId: 'IGACC' },
}

const DEFAULT_CONVERSATION = {
  id: 'c1',
  workspaceId: 'ws1',
  igThreadId: 'sender1',
  senderName: null,
  senderPhone: null,
  detectedIntent: null,
  escalated: false,
}

function primeMocks() {
  mockSocialAccountFindMany.mockResolvedValue([DEFAULT_ACCOUNT])
  mockConversationUpsert.mockResolvedValue(DEFAULT_CONVERSATION)
  mockMessageFindFirst.mockResolvedValue(null)
  mockMessageCreate.mockResolvedValue({})
  mockMessageFindMany.mockResolvedValue([{ role: 'user', text: 'привет' }])
  mockConversationUpdate.mockResolvedValue({})
  mockLeadUpsert.mockResolvedValue({ id: 'l1', name: 'sender1', phone: '+79001234567', intent: 'покупка авто' })

  // integration.findFirst: SALES_TELEGRAM → returns chatId config; SALES_KB → null
  mockIntegrationFindFirst.mockImplementation(
    ({ where }: { where: { type: string; workspaceId: string; enabled: boolean } }) => {
      if (where.type === 'SALES_TELEGRAM') {
        return Promise.resolve({ config: { chatId: 'tg-chat-1' }, enabled: true })
      }
      return Promise.resolve(null) // SALES_KB and anything else
    },
  )

  mockSendInstagramMessage.mockResolvedValue(undefined)
  mockSendTelegram.mockResolvedValue(undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  primeMocks()
})

// ─── test job helper ──────────────────────────────────────────────────────────

const baseJob = {
  igAccountId: 'IGACC',
  senderId: 'sender1',
  messageId: 'msg1',
  text: 'привет',
}

// ─── Test cases ───────────────────────────────────────────────────────────────

describe('handleInbound', () => {
  describe('QUALIFIED lead', () => {
    it('sends Instagram reply, upserts lead, and notifies Telegram with the phone number', async () => {
      mockRunSalesAgent.mockResolvedValue({
        replyText: 'Спасибо!',
        detectedIntent: 'покупка авто',
        extractedPhone: '+79001234567',
        qualification: 'QUALIFIED',
        needsEscalation: false,
      })

      await handleInbound(baseJob)

      // Instagram reply sent once to the right recipient with the right text
      expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
      expect(mockSendInstagramMessage).toHaveBeenCalledWith(
        expect.objectContaining({ recipientId: 'sender1', text: 'Спасибо!' }),
      )

      // Lead row upserted
      expect(mockLeadUpsert).toHaveBeenCalledTimes(1)

      // Telegram notification sent and contains the phone number
      expect(mockSendTelegram).toHaveBeenCalledTimes(1)
      const telegramMessage = mockSendTelegram.mock.calls[0]![1] as string
      expect(telegramMessage).toContain('+79001234567')
    })
  })

  describe('ESCALATION', () => {
    it('marks conversation escalated, notifies Telegram with "Эскалация", and does NOT upsert a lead', async () => {
      mockRunSalesAgent.mockResolvedValue({
        replyText: 'Нужен менеджер...',
        detectedIntent: null,
        extractedPhone: null,
        qualification: 'INTENT_UNCLEAR',
        needsEscalation: true,
      })

      await handleInbound(baseJob)

      // conversation.update called with escalated: true
      expect(mockConversationUpdate).toHaveBeenCalledTimes(1)
      const updateCall = mockConversationUpdate.mock.calls[0]![0] as {
        data: Record<string, unknown>
      }
      expect(updateCall.data['escalated']).toBe(true)

      // Telegram escalation notification sent and contains the word "Эскалация"
      expect(mockSendTelegram).toHaveBeenCalledTimes(1)
      const telegramMessage = mockSendTelegram.mock.calls[0]![1] as string
      expect(telegramMessage).toContain('Эскалация')

      // No lead created
      expect(mockLeadUpsert).not.toHaveBeenCalled()
    })
  })

  describe('DUPLICATE message (idempotency)', () => {
    it('returns early without calling runSalesAgent or sendInstagramMessage when the message already exists', async () => {
      // Simulate existing message for dedup
      mockMessageFindFirst.mockResolvedValue({ id: 'm-existing' })

      await handleInbound({ ...baseJob, messageId: 'dup1' })

      expect(mockRunSalesAgent).not.toHaveBeenCalled()
      expect(mockSendInstagramMessage).not.toHaveBeenCalled()
    })
  })
})
