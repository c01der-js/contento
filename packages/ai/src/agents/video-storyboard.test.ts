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

import { generateVideoStoryboard } from './video-storyboard.js'

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
})
