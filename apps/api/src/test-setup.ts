import { vi } from 'vitest'

vi.mock('@contento/ai', () => ({
  analyzeTrend: vi.fn().mockResolvedValue({ score: 80, summary: '', angles: [], risks: [] }),
  generateIdeas: vi.fn().mockResolvedValue([]),
  writeScript: vi.fn().mockResolvedValue({ hook: '', body: '', cta: '', caption: '', hashtags: [] }),
  checkBrand: vi.fn().mockResolvedValue({ score: 80, passed: true, issues: [], suggestions: [], summary: '' }),
}))
