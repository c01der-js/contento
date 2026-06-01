import { getAnthropicClient } from '../client.js';
import { buildBrandContext } from '../brand-context.js';
export async function analyzeTrend(workspaceId, trend) {
    const client = getAnthropicClient();
    const { systemBlock } = await buildBrandContext(workspaceId);
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [
            systemBlock,
            {
                type: 'text',
                text: 'You are a trend analyst. Evaluate this trend for brand-relevant content opportunities. Respond with valid JSON only, no markdown fences. Return a JSON object with fields: score (number 0-100), summary (string), angles (string[]), risks (string[]), category (string — one of: health, finance, entertainment, politics, technology, sports, lifestyle, business, science, culture, or another short category label).',
            },
        ],
        messages: [{ role: 'user', content: JSON.stringify(trend) }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100));
    }
}
