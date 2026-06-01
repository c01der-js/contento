import { prisma } from '@contento/db'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'

export interface BrandContext {
  /** Workspace this context was built for — used for cost attribution */
  workspaceId: string
  /** Ready-to-use system message block with cache_control set */
  systemBlock: TextBlockParam & { cache_control: { type: 'ephemeral' } }
  /** ISO timestamp for cache invalidation logging */
  fetchedAt: string
  /** Taboo topics that must not appear in trend titles or descriptions */
  tabooTopics: string[]
}

export async function buildBrandContext(workspaceId: string): Promise<BrandContext> {
  const [tones, pillars, vocabulary, personas, visualIdentity, tabooTopicRecords] = await Promise.all([
    prisma.brandTone.findMany({ where: { workspaceId } }),
    prisma.brandPillar.findMany({ where: { workspaceId } }),
    prisma.brandVocabulary.findMany({ where: { workspaceId } }),
    prisma.persona.findMany({ where: { workspaceId } }),
    prisma.visualIdentity.findUnique({ where: { workspaceId } }),
    prisma.tabooTopic.findMany({ where: { workspaceId }, select: { topic: true } }),
  ])

  const tabooTopics = tabooTopicRecords.map((t) => t.topic)

  const lines: string[] = ['## Brand Knowledge Base']

  if (tones.length > 0) {
    lines.push('\n### Voice & Tone')
    for (const t of tones) {
      lines.push(`- **${t.name}**: ${t.description ?? ''}`)
      if (t.examples.length > 0) lines.push(`  Examples: ${t.examples.join(' | ')}`)
    }
  }

  if (pillars.length > 0) {
    lines.push('\n### Content Pillars')
    for (const p of pillars) {
      lines.push(`- **${p.name}**: ${p.description ?? ''}`)
      if (p.keywords.length > 0) lines.push(`  Keywords: ${p.keywords.join(', ')}`)
    }
  }

  const allowed = vocabulary.filter(v => v.type === 'ALLOW')
  const forbidden = vocabulary.filter(v => v.type === 'FORBID')
  if (allowed.length > 0 || forbidden.length > 0) {
    lines.push('\n### Vocabulary')
    if (allowed.length > 0) lines.push(`- Use: ${allowed.map(v => v.word).join(', ')}`)
    if (forbidden.length > 0) lines.push(`- Avoid: ${forbidden.map(v => v.word).join(', ')}`)
  }

  if (personas.length > 0) {
    lines.push('\n### Target Audience')
    for (const p of personas) {
      lines.push(`- **${p.name}**: ${p.description ?? ''}`)
      if (p.painPoints.length > 0) lines.push(`  Pain points: ${p.painPoints.join('; ')}`)
      if (p.desires.length > 0) lines.push(`  Desires: ${p.desires.join('; ')}`)
    }
  }

  if (visualIdentity) {
    lines.push('\n### Visual Identity')
    if (visualIdentity.primaryColor) lines.push(`- Primary color: ${visualIdentity.primaryColor}`)
    if (visualIdentity.fontPrimary) lines.push(`- Primary font: ${visualIdentity.fontPrimary}`)
  }

  if (tabooTopics.length > 0) {
    lines.push('\n### Taboo Topics (do not engage with)')
    for (const topic of tabooTopics) {
      lines.push(`- ${topic}`)
    }
  }

  const text = lines.join('\n')

  return {
    workspaceId,
    systemBlock: {
      type: 'text',
      text,
      cache_control: { type: 'ephemeral' },
    },
    fetchedAt: new Date().toISOString(),
    tabooTopics,
  }
}
