import { runAnthropicMessage } from '../client.js'
import { buildBrandContext } from '../brand-context.js'

export type SalesQualification = 'UNQUALIFIED' | 'PHONE_MISSING' | 'INTENT_UNCLEAR' | 'QUALIFIED'

export interface SalesAgentResult {
  replyText: string
  detectedIntent: string | null
  extractedPhone: string | null
  qualification: SalesQualification
  needsEscalation: boolean
}

const VALID_QUALIFICATIONS = new Set<SalesQualification>([
  'UNQUALIFIED',
  'PHONE_MISSING',
  'INTENT_UNCLEAR',
  'QUALIFIED',
])

const SCHEMA_INSTRUCTION = `Ты — вежливый, профессиональный менеджер Automost (российский авторынок). Твоя задача: помочь клиенту и СОБРАТЬ его телефон + интент (цель обращения).

Отвечай ТОЛЬКО валидным JSON без markdown-обёртки, строго по схеме:
{
  "replyText": "<ответное сообщение клиенту на русском языке>",
  "detectedIntent": "<краткое описание интента, например «покупка авто: Toyota Camry, бюджет ~2 млн» | null>",
  "extractedPhone": "<российский номер телефона если клиент его указал, иначе null>",
  "qualification": "<одно из: UNQUALIFIED | PHONE_MISSING | INTENT_UNCLEAR | QUALIFIED>",
  "needsEscalation": <true | false>
}

Правила qualification:
- QUALIFIED — есть и интент, и телефон
- PHONE_MISSING — интент ясен, но телефона нет → вежливо попроси
- INTENT_UNCLEAR — телефон есть, но непонятно что нужно → уточни
- UNQUALIFIED — нет ни того, ни другого`

const GUARDRAILS = `Дополнительные правила:
- НЕ выдумывай цены, наличие, характеристики, которых нет в knowledgeBase. Если информации нет — попроси клиента оставить номер: «уточню у коллеги, перезвоним».
- Не обещай конкретные сроки, скидки или гарантии, которых нет в knowledgeBase.
- Если клиент торгуется по цене, спорит, жалуется, задаёт юридические вопросы или ведёт себя оскорбительно — установи needsEscalation: true и дай вежливый деэскалирующий ответ (не пытайся сам решить проблему).
- Если знаний нет в KB — не фантазируй.`

function isValidQualification(value: unknown): value is SalesQualification {
  return typeof value === 'string' && VALID_QUALIFICATIONS.has(value as SalesQualification)
}

function validateSalesAgentResult(data: unknown): SalesAgentResult {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Agent response is not a JSON object')
  }
  const d = data as Record<string, unknown>

  if (typeof d['replyText'] !== 'string' || d['replyText'].length === 0) {
    throw new Error('Agent response missing required field: "replyText"')
  }

  const detectedIntent =
    typeof d['detectedIntent'] === 'string' ? d['detectedIntent'] : null

  const extractedPhone =
    typeof d['extractedPhone'] === 'string' ? d['extractedPhone'] : null

  const qualification: SalesQualification = isValidQualification(d['qualification'])
    ? d['qualification']
    : 'UNQUALIFIED'

  const needsEscalation = typeof d['needsEscalation'] === 'boolean' ? d['needsEscalation'] : false

  return {
    replyText: d['replyText'] as string,
    detectedIntent,
    extractedPhone,
    qualification,
    needsEscalation,
  }
}

export async function runSalesAgent(
  workspaceId: string,
  input: {
    history: Array<{ role: 'user' | 'assistant'; text: string }>
    knowledgeBase?: string
  },
): Promise<SalesAgentResult> {
  const { systemBlock } = await buildBrandContext(workspaceId)

  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    systemBlock,
    { type: 'text', text: SCHEMA_INSTRUCTION },
    { type: 'text', text: GUARDRAILS },
  ]

  if (input.knowledgeBase && input.knowledgeBase.trim().length > 0) {
    system.push({ type: 'text', text: `## База знаний (knowledgeBase)\n\n${input.knowledgeBase}` })
  }

  const messages = input.history.map((msg) => ({
    role: msg.role,
    content: msg.text,
  }))

  const response = await runAnthropicMessage({ agent: 'sales-agent', workspaceId }, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system,
    messages,
  })

  const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100))
  }

  return validateSalesAgentResult(parsed)
}
