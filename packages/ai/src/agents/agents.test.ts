import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @contento/db before importing modules under test
vi.mock('@contento/db', () => ({
  prisma: {
    brandTone: { findMany: vi.fn().mockResolvedValue([]) },
    brandPillar: { findMany: vi.fn().mockResolvedValue([]) },
    brandVocabulary: { findMany: vi.fn().mockResolvedValue([]) },
    persona: { findMany: vi.fn().mockResolvedValue([]) },
    visualIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
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

import { analyzeTrend } from './trend-analyzer.js'
import { generateIdeas } from './idea-generator.js'
import { writeScript } from './scriptwriter.js'
import { checkBrand } from './brand-checker.js'

function makeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── analyzeTrend ────────────────────────────────────────────────────────────

describe('analyzeTrend', () => {
  const trend = { title: 'Short-form video', description: 'Reels and TikToks are booming' }

  const validAnalysis = {
    score: 85,
    summary: 'This trend is highly relevant.',
    angles: ['Educational reels', 'Behind the scenes', 'User tips'],
    risks: ['Oversaturation'],
  }

  it('returns parsed TrendAnalysis when Claude returns valid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validAnalysis)))

    const result = await analyzeTrend('ws-1', trend)

    expect(result).toEqual(validAnalysis)
  })

  it('throws descriptive error when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('not valid json at all'))

    await expect(analyzeTrend('ws-1', trend)).rejects.toThrow(
      'Agent returned invalid JSON: not valid json at all',
    )
  })

  it('calls claude-haiku-4-5-20251001 model', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validAnalysis)))

    await analyzeTrend('ws-1', trend)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    )
  })
})

// ─── generateIdeas ───────────────────────────────────────────────────────────

describe('generateIdeas', () => {
  const trend = { title: 'Short-form video' }

  const validIdeas = [
    {
      title: 'Quick Tips Reel',
      angle: 'Fast value delivery',
      format: 'reel',
      platform: 'instagram',
      rationale: 'Fits brand voice',
    },
    {
      title: 'How-to Carousel',
      angle: 'Step-by-step guide',
      format: 'carousel',
      platform: 'instagram',
      rationale: 'Educational content',
    },
  ]

  it('returns parsed ContentIdea[] when Claude returns valid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validIdeas)))

    const result = await generateIdeas('ws-1', trend)

    expect(result).toEqual(validIdeas)
  })

  it('throws descriptive error when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('{ broken json'))

    await expect(generateIdeas('ws-1', trend)).rejects.toThrow('Agent returned invalid JSON:')
  })

  it('calls claude-sonnet-4-6 model', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validIdeas)))

    await generateIdeas('ws-1', trend)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    )
  })

  it('passes count to the user message', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validIdeas)))

    await generateIdeas('ws-1', trend, 5)

    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArgs.messages[0].content)
    expect(userContent.count).toBe(5)
  })

  it('defaults count to 7', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validIdeas)))

    await generateIdeas('ws-1', trend)

    const callArgs = mockCreate.mock.calls[0][0]
    const userContent = JSON.parse(callArgs.messages[0].content)
    expect(userContent.count).toBe(7)
  })
})

// ─── writeScript ─────────────────────────────────────────────────────────────

describe('writeScript', () => {
  const idea = {
    title: 'Quick Tips Reel',
    angle: 'Fast value delivery',
    format: 'reel',
    platform: 'instagram',
  }

  const validScript = {
    hook: 'Did you know this one trick saves hours?',
    body: 'Here is the full breakdown of how to do it...',
    cta: 'Save this post and try it today!',
    caption: 'Work smarter, not harder. Here is how.',
    hashtags: ['productivity', 'tips', 'instagram', 'reels', 'workflow'],
  }

  it('returns parsed ContentScript when Claude returns valid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validScript)))

    const result = await writeScript('ws-1', idea)

    expect(result).toEqual(validScript)
  })

  it('throws descriptive error when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('plain text, not json'))

    await expect(writeScript('ws-1', idea)).rejects.toThrow('Agent returned invalid JSON:')
  })

  it('calls claude-sonnet-4-6 model', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validScript)))

    await writeScript('ws-1', idea)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    )
  })
})

// ─── checkBrand ──────────────────────────────────────────────────────────────

describe('checkBrand', () => {
  const script = {
    hook: 'Did you know this one trick saves hours?',
    body: 'Here is the full breakdown...',
    cta: 'Save this post!',
    caption: 'Work smarter, not harder.',
  }

  const makeCriterion = (score: number) => ({
    score,
    passed: score >= 70,
    issues: [] as string[],
    suggestions: [] as string[],
  })

  const validResult = {
    overallScore: 82,
    passed: true,
    summary: 'Content aligns well with brand guidelines.',
    criteria: {
      tone: makeCriterion(82),
      vocabulary: makeCriterion(82),
      pillar: makeCriterion(82),
      persona: makeCriterion(82),
      visual: makeCriterion(82),
      legal: makeCriterion(82),
    },
  }

  const failingResult = {
    overallScore: 55,
    passed: false,
    summary: 'Content does not meet the minimum brand compliance threshold.',
    criteria: {
      tone: { score: 55, passed: false, issues: ['Tone is too casual'], suggestions: ['Adjust tone to be more professional'] },
      vocabulary: makeCriterion(55),
      pillar: makeCriterion(55),
      persona: makeCriterion(55),
      visual: makeCriterion(55),
      legal: makeCriterion(55),
    },
  }

  it('returns parsed BrandCheckResult when Claude returns valid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    const result = await checkBrand('ws-1', script)

    expect(result).toEqual(validResult)
  })

  it('correctly reflects passed=false for low scores', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(failingResult)))

    const result = await checkBrand('ws-1', script)

    expect(result.passed).toBe(false)
    expect(result.overallScore).toBe(55)
  })

  it('throws descriptive error when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(makeResponse('oops'))

    await expect(checkBrand('ws-1', script)).rejects.toThrow('Agent returned invalid JSON: oops')
  })

  it('calls claude-haiku-4-5-20251001 model', async () => {
    mockCreate.mockResolvedValue(makeResponse(JSON.stringify(validResult)))

    await checkBrand('ws-1', script)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }),
    )
  })
})
