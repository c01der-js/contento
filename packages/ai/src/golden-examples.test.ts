import { describe, it, expect, vi } from 'vitest'

// Mock @contento/db so the module-level import doesn't require the generated Prisma client
vi.mock('@contento/db', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    goldenExample: { findUnique: vi.fn(), create: vi.fn() },
    script: { findUnique: vi.fn() },
  },
}))

import { formatGoldenBlock } from './golden-examples.js'

describe('formatGoldenBlock', () => {
  it('returns null for no matches', () => {
    expect(formatGoldenBlock([])).toBeNull()
  })
  it('formats matches into a numbered few-shot block', () => {
    const block = formatGoldenBlock([
      { id: '1', title: 'Hook A', content: 'body a', similarity: 0.9 },
      { id: '2', title: '', content: 'body b', similarity: 0.8 },
    ])
    expect(block).toContain('High-performing examples')
    expect(block).toContain('1. Hook A — body a')
    expect(block).toContain('2. body b')
  })
})
