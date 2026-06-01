import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @contento/db before importing the module under test
vi.mock('@contento/db', () => ({
  prisma: {
    brandTone: { findMany: vi.fn() },
    brandPillar: { findMany: vi.fn() },
    brandVocabulary: { findMany: vi.fn() },
    persona: { findMany: vi.fn() },
    visualIdentity: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@contento/db'
import { buildBrandContext } from './brand-context.js'

const mockPrisma = prisma as unknown as {
  brandTone: { findMany: ReturnType<typeof vi.fn> }
  brandPillar: { findMany: ReturnType<typeof vi.fn> }
  brandVocabulary: { findMany: ReturnType<typeof vi.fn> }
  persona: { findMany: ReturnType<typeof vi.fn> }
  visualIdentity: { findUnique: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: all queries return empty results
  mockPrisma.brandTone.findMany.mockResolvedValue([])
  mockPrisma.brandPillar.findMany.mockResolvedValue([])
  mockPrisma.brandVocabulary.findMany.mockResolvedValue([])
  mockPrisma.persona.findMany.mockResolvedValue([])
  mockPrisma.visualIdentity.findUnique.mockResolvedValue(null)
})

describe('buildBrandContext', () => {
  it('returns only the header when workspace has no brand data', async () => {
    const result = await buildBrandContext('ws-empty')

    expect(result.systemBlock.type).toBe('text')
    expect(result.systemBlock.text).toBe('## Brand Knowledge Base')
    expect(result.systemBlock.cache_control).toEqual({ type: 'ephemeral' })
    expect(result.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('sets cache_control to ephemeral on all responses', async () => {
    const result = await buildBrandContext('ws-any')

    expect(result.systemBlock.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('formats tones, pillars, and vocabulary sections in correct order', async () => {
    mockPrisma.brandTone.findMany.mockResolvedValue([
      {
        id: 't1',
        workspaceId: 'ws-1',
        name: 'Friendly',
        description: 'Warm and approachable',
        examples: ['Hey there!', 'Let us help you out.'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    mockPrisma.brandPillar.findMany.mockResolvedValue([
      {
        id: 'p1',
        workspaceId: 'ws-1',
        name: 'Innovation',
        description: 'Always pushing boundaries',
        keywords: ['cutting-edge', 'future'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    mockPrisma.brandVocabulary.findMany.mockResolvedValue([
      {
        id: 'v1',
        workspaceId: 'ws-1',
        word: 'synergy',
        type: 'FORBID',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'v2',
        workspaceId: 'ws-1',
        word: 'empower',
        type: 'ALLOW',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await buildBrandContext('ws-1')
    const text = result.systemBlock.text

    // Sections must appear in order: header → tones → pillars → vocabulary
    const headerPos = text.indexOf('## Brand Knowledge Base')
    const tonePos = text.indexOf('### Voice & Tone')
    const pillarsPos = text.indexOf('### Content Pillars')
    const vocabPos = text.indexOf('### Vocabulary')

    expect(headerPos).toBeGreaterThanOrEqual(0)
    expect(tonePos).toBeGreaterThan(headerPos)
    expect(pillarsPos).toBeGreaterThan(tonePos)
    expect(vocabPos).toBeGreaterThan(pillarsPos)

    // Tone content
    expect(text).toContain('**Friendly**: Warm and approachable')
    expect(text).toContain('Examples: Hey there! | Let us help you out.')

    // Pillar content
    expect(text).toContain('**Innovation**: Always pushing boundaries')
    expect(text).toContain('Keywords: cutting-edge, future')

    // Vocabulary content
    expect(text).toContain('- Use: empower')
    expect(text).toContain('- Avoid: synergy')
    expect(result.systemBlock.cache_control).toEqual({ type: 'ephemeral' })
  })

  it('separates allowed and forbidden vocabulary correctly', async () => {
    mockPrisma.brandVocabulary.findMany.mockResolvedValue([
      {
        id: 'v1',
        workspaceId: 'ws-2',
        word: 'impact',
        type: 'ALLOW',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'v2',
        workspaceId: 'ws-2',
        word: 'leverage',
        type: 'ALLOW',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'v3',
        workspaceId: 'ws-2',
        word: 'synergy',
        type: 'FORBID',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'v4',
        workspaceId: 'ws-2',
        word: 'pivot',
        type: 'FORBID',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await buildBrandContext('ws-2')
    const text = result.systemBlock.text

    // Allowed words appear in Use line
    expect(text).toContain('- Use: impact, leverage')
    // Forbidden words appear in Avoid line
    expect(text).toContain('- Avoid: synergy, pivot')

    // Use and Avoid lines are separate
    const useLine = text.split('\n').find((l: string) => l.startsWith('- Use:'))
    const avoidLine = text.split('\n').find((l: string) => l.startsWith('- Avoid:'))
    expect(useLine).toBeDefined()
    expect(avoidLine).toBeDefined()
    expect(useLine).not.toContain('synergy')
    expect(avoidLine).not.toContain('impact')
  })

  it('omits vocabulary section when there are no vocabulary entries', async () => {
    const result = await buildBrandContext('ws-no-vocab')
    expect(result.systemBlock.text).not.toContain('### Vocabulary')
  })

  it('includes persona and visual identity sections when present', async () => {
    mockPrisma.persona.findMany.mockResolvedValue([
      {
        id: 'per1',
        workspaceId: 'ws-3',
        name: 'Sarah the Marketer',
        description: 'Mid-level marketing manager',
        painPoints: ['Too many tools', 'No time'],
        desires: ['Simplicity', 'Results'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    mockPrisma.visualIdentity.findUnique.mockResolvedValue({
      id: 'vi1',
      workspaceId: 'ws-3',
      primaryColor: '#FF5733',
      secondaryColor: null,
      accentColor: null,
      fontPrimary: 'Inter',
      fontSecondary: null,
      logoUrl: null,
      watermarkUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await buildBrandContext('ws-3')
    const text = result.systemBlock.text

    expect(text).toContain('### Target Audience')
    expect(text).toContain('**Sarah the Marketer**: Mid-level marketing manager')
    expect(text).toContain('Pain points: Too many tools; No time')
    expect(text).toContain('Desires: Simplicity; Results')

    expect(text).toContain('### Visual Identity')
    expect(text).toContain('- Primary color: #FF5733')
    expect(text).toContain('- Primary font: Inter')
  })

  it('queries all tables with the correct workspaceId', async () => {
    await buildBrandContext('ws-check')

    expect(mockPrisma.brandTone.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-check' } })
    expect(mockPrisma.brandPillar.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-check' } })
    expect(mockPrisma.brandVocabulary.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-check' } })
    expect(mockPrisma.persona.findMany).toHaveBeenCalledWith({ where: { workspaceId: 'ws-check' } })
    expect(mockPrisma.visualIdentity.findUnique).toHaveBeenCalledWith({ where: { workspaceId: 'ws-check' } })
  })
})
