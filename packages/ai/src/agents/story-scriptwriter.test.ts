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

import { storyToScript } from './story-scriptwriter.js'
import type { ContentScript } from './scriptwriter.js'

function makeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  }
}

const sampleStory =
  'Я ехал поздно ночью, машина заглохла посреди трассы. Рядом никого. Вдруг остановился незнакомец и помог мне добраться до дома.'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── storyToScript ────────────────────────────────────────────────────────────

describe('storyToScript', () => {
  // (a) parses a mocked JSON response into ContentScript
  it('parses a valid JSON response into ContentScript', async () => {
    const validScript: ContentScript = {
      hook: 'Моя машина заглохла ночью на трассе — я не знал, что делать',
      body: 'Было уже за полночь. Телефон садился. Ни одной машины. И тут...',
      cta: 'Расскажи в комментариях — тебя когда-нибудь выручал незнакомец?',
      caption: 'История, которая напомнила мне, что добрые люди ещё есть 🙏',
      hashtags: ['#добро', '#история', '#реальнаяжизнь', '#люди', '#shorts'],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validScript)))

    const result = await storyToScript('ws-1', { storyText: sampleStory })

    expect(result).toEqual(validScript)
  })

  // (b) all required fields are present
  it('returns all five required ContentScript fields', async () => {
    const script: ContentScript = {
      hook: 'Это изменило всё',
      body: 'Тело сценария',
      cta: 'Подпишись',
      caption: 'Подпись к видео',
      hashtags: ['#тег1'],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(script)))

    const result = await storyToScript('ws-1', { storyText: sampleStory })

    expect(result.hook).toBe('Это изменило всё')
    expect(result.body).toBe('Тело сценария')
    expect(result.cta).toBe('Подпишись')
    expect(result.caption).toBe('Подпись к видео')
    expect(Array.isArray(result.hashtags)).toBe(true)
  })

  // (c) strips markdown fences from agent response
  it('strips markdown fences from agent response', async () => {
    const script: ContentScript = {
      hook: 'Хук с фенсами',
      body: 'Тело',
      cta: 'CTA',
      caption: 'Подпись',
      hashtags: ['#тег'],
    }
    mockCreate.mockResolvedValue(makeResponse('```json\n' + JSON.stringify(script) + '\n```'))

    const result = await storyToScript('ws-1', { storyText: sampleStory })

    expect(result.hook).toBe('Хук с фенсами')
  })

  // (d) throws on completely invalid JSON
  it('throws on completely invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('не JSON вообще'))

    await expect(
      storyToScript('ws-1', { storyText: sampleStory }),
    ).rejects.toThrow('Agent returned invalid JSON:')
  })

  // (e) throws when a required field is missing
  it('throws when hook is missing', async () => {
    mockCreate.mockResolvedValue(
      makeResponse(JSON.stringify({ body: 'Тело', cta: 'CTA', caption: 'Подпись', hashtags: [] })),
    )

    await expect(
      storyToScript('ws-1', { storyText: sampleStory }),
    ).rejects.toThrow('Agent response missing required field: "hook"')
  })

  it('throws when hashtags is not an array', async () => {
    mockCreate.mockResolvedValue(
      makeResponse(
        JSON.stringify({ hook: 'Хук', body: 'Тело', cta: 'CTA', caption: 'Подпись', hashtags: '#тег' }),
      ),
    )

    await expect(
      storyToScript('ws-1', { storyText: sampleStory }),
    ).rejects.toThrow('Agent response field "hashtags" must be an array')
  })

  // (f) calls claude-sonnet-4-6 model
  it('calls claude-sonnet-4-6 model', async () => {
    const script: ContentScript = {
      hook: 'Хук',
      body: 'Тело',
      cta: 'CTA',
      caption: 'Подпись',
      hashtags: [],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(script)))

    await storyToScript('ws-1', { storyText: sampleStory })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    )
  })

  // (g) story text is passed as the user message content
  it('sends storyText as the user message content', async () => {
    const script: ContentScript = {
      hook: 'Хук',
      body: 'Тело',
      cta: 'CTA',
      caption: 'Подпись',
      hashtags: [],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(script)))

    await storyToScript('ws-1', { storyText: sampleStory })

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages).toHaveLength(1)
    expect(callArgs.messages[0]).toEqual({ role: 'user', content: sampleStory })
  })

  // (h) platform-specific instruction is included in system when platform is provided
  it('includes platform guidance in system blocks when platform is provided', async () => {
    const script: ContentScript = {
      hook: 'Хук',
      body: 'Тело',
      cta: 'CTA',
      caption: 'Подпись',
      hashtags: [],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(script)))

    await storyToScript('ws-1', { storyText: sampleStory, platform: 'tiktok' })

    const callArgs = mockCreate.mock.calls[0][0]
    const systemTexts: string[] = callArgs.system.map((s: { text: string }) => s.text)
    const combined = systemTexts.join('\n')
    // Should mention tiktok or TikTok
    expect(combined.toLowerCase()).toContain('tiktok')
  })

  // (i) default instruction is used when no platform is provided
  it('uses default vertical short-form guidance when no platform is provided', async () => {
    const script: ContentScript = {
      hook: 'Хук',
      body: 'Тело',
      cta: 'CTA',
      caption: 'Подпись',
      hashtags: [],
    }
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(script)))

    await storyToScript('ws-1', { storyText: sampleStory })

    const callArgs = mockCreate.mock.calls[0][0]
    const systemTexts: string[] = callArgs.system.map((s: { text: string }) => s.text)
    const combined = systemTexts.join('\n')
    expect(combined).toContain('вертикальное')
  })
})
