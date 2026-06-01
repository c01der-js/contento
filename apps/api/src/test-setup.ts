import { vi } from 'vitest'

vi.mock('@contento/ai', () => ({
  analyzeTrend: vi.fn().mockResolvedValue({ score: 80, summary: '', angles: [], risks: [] }),
  generateIdeas: vi.fn().mockResolvedValue([]),
  writeScript: vi.fn().mockResolvedValue({ hook: '', body: '', cta: '', caption: '', hashtags: [] }),
  checkBrand: vi.fn().mockResolvedValue({ score: 80, passed: true, issues: [], suggestions: [], summary: '' }),
  analyzeCompany: vi.fn().mockResolvedValue({ niche: '', description: '', usp: '', targetAudience: '', competitors: [], contentAngles: [] }),
  generateContentPlan: vi.fn().mockResolvedValue([]),
  generateCharacterPortrait: vi.fn().mockResolvedValue('mock-job-id'),
  pollJobUntilDone: vi.fn().mockResolvedValue('https://example.com/mock.png'),
  isMockMode: vi.fn().mockReturnValue(true),
  MOCK_IMAGE_URL: 'https://placehold.co/1024x1024/png',
}))
