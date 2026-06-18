import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@contento/db', () => ({
  prisma: {
    brandTone: { findMany: vi.fn().mockResolvedValue([]) },
    brandPillar: { findMany: vi.fn().mockResolvedValue([]) },
    brandVocabulary: { findMany: vi.fn().mockResolvedValue([]) },
    persona: { findMany: vi.fn().mockResolvedValue([]) },
    visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    tabooTopic: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { generateVideoStoryboard, VideoShotSchema } from './video-storyboard.js'

function agentReply(text: string) {
  return { content: [{ type: 'text', text }] }
}

beforeEach(() => vi.clearAllMocks())

describe('generateVideoStoryboard', () => {
  it('parses valid shot list from agent response', async () => {
    const shots = [
      { index: 0, prompt: 'Close-up of founder looking at camera', dialogue: 'Did you know most SMEs overpay for ads?', durationSec: 3 },
      { index: 1, prompt: 'Screen recording of dashboard', dialogue: 'We built Contento to fix that.', durationSec: 4 },
      { index: 2, prompt: 'Founder smiling, product logo visible', dialogue: 'Try it free today.', durationSec: 3 },
    ]
    mockCreate.mockResolvedValue(agentReply(JSON.stringify(shots)))

    const result = await generateVideoStoryboard('ws1', {
      hook: 'Did you know most SMEs overpay for ads?',
      body: 'We built Contento to fix that.',
      cta: 'Try it free today.',
    })

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ index: 0, durationSec: 3 })
    expect(result[0]?.dialogue).toBe('Did you know most SMEs overpay for ads?')
  })

  it('strips markdown fences from agent response', async () => {
    const shots = [
      { index: 0, prompt: 'Hero shot', durationSec: 2.5 },
    ]
    mockCreate.mockResolvedValue(agentReply('```json\n' + JSON.stringify(shots) + '\n```'))
    const result = await generateVideoStoryboard('ws1', { hook: 'H', body: 'B', cta: 'C' })
    expect(result).toHaveLength(1)
  })

  it('throws on non-array response', async () => {
    mockCreate.mockResolvedValue(agentReply('{"not": "an array"}'))
    await expect(
      generateVideoStoryboard('ws1', { hook: 'H', body: 'B', cta: 'C' }),
    ).rejects.toThrow()
  })

  it('throws on invalid JSON', async () => {
    mockCreate.mockResolvedValue(agentReply('not json'))
    await expect(
      generateVideoStoryboard('ws1', { hook: 'H', body: 'B', cta: 'C' }),
    ).rejects.toThrow('invalid JSON')
  })

  it('throws when shot missing required fields', async () => {
    const badShots = [{ index: 0 }]  // missing prompt and durationSec
    mockCreate.mockResolvedValue(agentReply(JSON.stringify(badShots)))
    await expect(
      generateVideoStoryboard('ws1', { hook: 'H', body: 'B', cta: 'C' }),
    ).rejects.toThrow()
  })

  it('parses a screencast shot with discriminated content (slides)', () => {
    const parsed = VideoShotSchema.parse({
      index: 1, shotType: 'screencast', prompt: 'slides screen', dialogue: 'три причины',
      screencastContent: { template: 'slides', title: 'Три причины', bullets: ['Раз', 'Два', 'Три'] },
      durationSec: 5,
    })
    expect(parsed.shotType).toBe('screencast')
    expect(parsed.screencastContent?.template).toBe('slides')
  })

  it('rejects screencast content with the wrong shape for its template', () => {
    const r = VideoShotSchema.safeParse({
      index: 1, shotType: 'screencast', prompt: 'x', durationSec: 5,
      screencastContent: { template: 'chat', title: 'nope' }, // chat needs messages, not title
    })
    expect(r.success).toBe(false)
  })

  it('instructs a b-roll quota for platforms with broll weight, and parses shotType', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { index: 0, shotType: 'avatar', prompt: 'host on camera', dialogue: 'Привет', durationSec: 3 },
        { index: 1, shotType: 'broll', prompt: 'city street timelapse, no people', headline: 'Смотри сюда', durationSec: 4 },
      ]) }],
    })
    // shotCount 5 so the prompt's "spread b-roll through the middle, never first/last" rule is satisfiable
    const shots = await generateVideoStoryboard('ws1', { hook: 'h', body: 'b', cta: 'c' }, { shotCount: 5, platform: 'instagram' })
    const systemText = mockCreate.mock.calls.at(-1)![0].system.map((s: { text: string }) => s.text).join('\n')
    expect(systemText).toContain('b-roll')
    expect(shots[1]!.shotType).toBe('broll')
    expect(shots[1]!.headline).toBe('Смотри сюда')
  })

  it('instructs a screencast quota and parses screencast shots with content', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { index: 0, shotType: 'avatar', prompt: 'host', dialogue: 'Привет', durationSec: 3 },
        { index: 1, shotType: 'screencast', prompt: 'slides', dialogue: 'три причины',
          screencastContent: { template: 'slides', title: 'Три причины', bullets: ['А', 'Б'] }, durationSec: 5 },
        { index: 2, shotType: 'avatar', prompt: 'host', dialogue: 'Пока', durationSec: 3 },
      ]) }],
    })
    const shots = await generateVideoStoryboard('ws1', { hook: 'h', body: 'b', cta: 'c' }, { shotCount: 5, platform: 'telegram' })
    const systemText = mockCreate.mock.calls.at(-1)![0].system.map((s: { text: string }) => s.text).join('\n')
    expect(systemText).toContain('screencast')
    expect(shots[1]!.shotType).toBe('screencast')
    expect(shots[1]!.screencastContent?.template).toBe('slides')
  })
})
