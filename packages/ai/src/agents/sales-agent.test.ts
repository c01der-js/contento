import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @contento/db before importing modules under test
vi.mock('@contento/db', () => ({
  prisma: {
    brandTone: { findMany: vi.fn().mockResolvedValue([]) },
    brandPillar: { findMany: vi.fn().mockResolvedValue([]) },
    brandVocabulary: { findMany: vi.fn().mockResolvedValue([]) },
    persona: { findMany: vi.fn().mockResolvedValue([]) },
    visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    tabooTopic: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}))

// Mock @anthropic-ai/sdk
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}))

import { runSalesAgent } from './sales-agent.js'
import type { SalesAgentResult } from './sales-agent.js'

function makeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

const baseHistory = [
  { role: 'user' as const, text: 'Здравствуйте, хочу купить Toyota Camry' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── runSalesAgent ────────────────────────────────────────────────────────────

describe('runSalesAgent', () => {
  // (a) parses a mocked JSON response into SalesAgentResult
  it('parses a valid JSON response into SalesAgentResult', async () => {
    const validResult: SalesAgentResult = {
      replyText: 'Добрый день! Рады помочь с подбором Toyota Camry. Оставьте, пожалуйста, ваш номер телефона.',
      detectedIntent: 'покупка авто: Toyota Camry',
      extractedPhone: null,
      qualification: 'PHONE_MISSING',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    const result = await runSalesAgent('ws-1', { history: baseHistory })

    expect(result).toEqual(validResult)
  })

  // (b) extractedPhone is surfaced when present
  it('surfaces extractedPhone when the customer provides a phone number', async () => {
    const resultWithPhone: SalesAgentResult = {
      replyText: 'Отлично, записали! Наш менеджер свяжется с вами в ближайшее время.',
      detectedIntent: 'покупка авто: Toyota Camry, бюджет ~2 млн',
      extractedPhone: '+79161234567',
      qualification: 'QUALIFIED',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(resultWithPhone)))

    const result = await runSalesAgent('ws-1', {
      history: [
        { role: 'user', text: 'Хочу Toyota Camry, бюджет 2 миллиона, мой телефон +79161234567' },
      ],
    })

    expect(result.extractedPhone).toBe('+79161234567')
    expect(result.qualification).toBe('QUALIFIED')
  })

  // (c) needsEscalation true is surfaced
  it('surfaces needsEscalation=true when the agent escalates', async () => {
    const escalationResult: SalesAgentResult = {
      replyText: 'Понимаю вашу озабоченность. Передам ваш вопрос старшему менеджеру — он свяжется с вами.',
      detectedIntent: 'жалоба на качество обслуживания',
      extractedPhone: null,
      qualification: 'UNQUALIFIED',
      needsEscalation: true,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(escalationResult)))

    const result = await runSalesAgent('ws-1', {
      history: [
        { role: 'user', text: 'Это безобразие! Требую возврат денег и директора!' },
      ],
    })

    expect(result.needsEscalation).toBe(true)
  })

  // (d) invalid/garbage response throws or coerces safely
  it('throws on completely invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('не JSON вообще'))

    await expect(
      runSalesAgent('ws-1', { history: baseHistory }),
    ).rejects.toThrow('Agent returned invalid JSON:')
  })

  it('throws when replyText is missing', async () => {
    mockCreate.mockResolvedValue(
      makeResponse(JSON.stringify({ detectedIntent: null, extractedPhone: null, qualification: 'UNQUALIFIED', needsEscalation: false })),
    )

    await expect(
      runSalesAgent('ws-1', { history: baseHistory }),
    ).rejects.toThrow('Agent response missing required field: "replyText"')
  })

  it('coerces unknown qualification to UNQUALIFIED', async () => {
    const garbledResult = {
      replyText: 'Привет!',
      detectedIntent: null,
      extractedPhone: null,
      qualification: 'TOTALLY_UNKNOWN_VALUE',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(garbledResult)))

    const result = await runSalesAgent('ws-1', { history: baseHistory })

    expect(result.qualification).toBe('UNQUALIFIED')
  })

  it('coerces missing optional fields (detectedIntent, extractedPhone, needsEscalation) to null/false', async () => {
    const minimalResult = {
      replyText: 'Здравствуйте! Чем могу помочь?',
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(minimalResult)))

    const result = await runSalesAgent('ws-1', { history: baseHistory })

    expect(result.detectedIntent).toBeNull()
    expect(result.extractedPhone).toBeNull()
    expect(result.needsEscalation).toBe(false)
    expect(result.qualification).toBe('UNQUALIFIED')
  })

  it('strips markdown fences from agent response', async () => {
    const validResult: SalesAgentResult = {
      replyText: 'Добрый день!',
      detectedIntent: null,
      extractedPhone: null,
      qualification: 'UNQUALIFIED',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse('```json\n' + JSON.stringify(validResult) + '\n```'))

    const result = await runSalesAgent('ws-1', { history: baseHistory })

    expect(result.replyText).toBe('Добрый день!')
  })

  it('includes knowledgeBase as an extra system block when provided', async () => {
    const validResult: SalesAgentResult = {
      replyText: 'Ответ на основе KB',
      detectedIntent: null,
      extractedPhone: null,
      qualification: 'UNQUALIFIED',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    await runSalesAgent('ws-1', {
      history: baseHistory,
      knowledgeBase: 'Toyota Camry 2024 в наличии: 1 штука. Цена: 2 500 000 руб.',
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const systemTexts: string[] = callArgs.system.map((s: { text: string }) => s.text)
    const combined = systemTexts.join('\n')
    expect(combined).toContain('Toyota Camry 2024 в наличии')
    expect(combined).toContain('knowledgeBase')
  })

  it('calls claude-haiku-4-5-20251001 model', async () => {
    const validResult: SalesAgentResult = {
      replyText: 'Привет',
      detectedIntent: null,
      extractedPhone: null,
      qualification: 'UNQUALIFIED',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    await runSalesAgent('ws-1', { history: baseHistory })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    )
  })

  it('maps conversation history to Anthropic message format', async () => {
    const validResult: SalesAgentResult = {
      replyText: 'Продолжаем',
      detectedIntent: null,
      extractedPhone: null,
      qualification: 'UNQUALIFIED',
      needsEscalation: false,
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    const history = [
      { role: 'user' as const, text: 'Первый вопрос' },
      { role: 'assistant' as const, text: 'Первый ответ' },
      { role: 'user' as const, text: 'Второй вопрос' },
    ]

    await runSalesAgent('ws-1', { history })

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages).toHaveLength(3)
    expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'Первый вопрос' })
    expect(callArgs.messages[1]).toEqual({ role: 'assistant', content: 'Первый ответ' })
    expect(callArgs.messages[2]).toEqual({ role: 'user', content: 'Второй вопрос' })
  })
})
