import { getPlatformProfile } from '@contento/shared'
import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'
import { buildGoldenExamplesBlock } from '../golden-examples.js'
import type { ContentScript } from './scriptwriter.js'

export type { ContentScript }

const SCHEMA_INSTRUCTION = `Ты — профессиональный сценарист, режиссёр и копирайтер коротких видео. Тебе дают РЕАЛЬНУЮ историю из жизни. Преврати её в живой, эмоционально цепляющий сценарий для короткого вертикального видео в голосе бренда: найди драматическое ядро/конфликт, начни с хука в первые секунды, сохрани достоверность (не выдумывай факты, противоречащие истории). Ответ — строго валидный JSON без markdown-ограждений, ровно: { hook, body, cta, caption, hashtags: [] }. Пиши на русском.`

function storyPlatformInstruction(platform?: string, format?: string): string {
  if (platform) {
    const p = getPlatformProfile(platform)
    const captionGuide =
      p.captionStyle === 'seo-keyword-first'
        ? 'Подпись — SEO-first: начни с ключевой фразы, которую зритель мог бы искать.'
        : 'Подпись — разговорная, с открытием любопытства/комментариев, на живом русском.'
    return [
      `Целевая платформа: ${p.platform}.`,
      `Голосовой сценарий должен уложиться в ${p.targetDurationSec.min}-${p.targetDurationSec.max}с (ориентир ${p.targetDurationSec.ideal}с, ~${Math.round(p.targetDurationSec.ideal * 2.5)} слов закадрового текста).`,
      `Хук должен прозвучать в первые ${p.hookWindowSec} секунд.`,
      captionGuide,
      `Подпись максимум ${p.captionMaxLen} символов. Ровно ${p.hashtagCount} хештегов.`,
      format ? `Формат контента: ${format}.` : '',
      'Пиши весь вывод на русском.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Default: vertical short-form, ~30s, Russian
  return [
    'Целевой формат: вертикальное короткое видео (Reels / Shorts / TikTok), ~30с.',
    'Хук должен прозвучать в первые 3 секунды.',
    'Подпись — разговорная, цепляющая, на русском. Максимум 300 символов. Минимум 5 хештегов.',
    format ? `Формат контента: ${format}.` : '',
    'Пиши весь вывод на русском.',
  ]
    .filter(Boolean)
    .join('\n')
}

function validateScript(data: unknown): ContentScript {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Agent response is not a JSON object')
  }
  const d = data as Record<string, unknown>
  const required = ['hook', 'body', 'cta', 'caption', 'hashtags'] as const
  for (const key of required) {
    if (d[key] == null) throw new Error(`Agent response missing required field: "${key}"`)
  }
  if (!Array.isArray(d['hashtags'])) throw new Error('Agent response field "hashtags" must be an array')
  return d as unknown as ContentScript
}

export async function storyToScript(
  workspaceId: string,
  input: { storyText: string; format?: string; platform?: string },
): Promise<ContentScript> {
  const { systemBlock } = await buildBrandContext(workspaceId)
  const goldenBlock = await buildGoldenExamplesBlock(workspaceId, input.storyText.slice(0, 2000))

  const response = await runAnthropicMessage({ agent: 'story-scriptwriter', workspaceId }, {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      systemBlock,
      { type: 'text', text: SCHEMA_INSTRUCTION },
      { type: 'text', text: storyPlatformInstruction(input.platform, input.format) },
      ...(goldenBlock ? [{ type: 'text' as const, text: goldenBlock }] : []),
    ],
    messages: [{ role: 'user', content: input.storyText }],
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }

  return validateScript(parsed)
}
