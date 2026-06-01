import { getAnthropicClient } from '../client.js';
import { buildBrandContext } from '../brand-context.js';
export async function writeScript(workspaceId, idea) {
    const client = getAnthropicClient();
    const { systemBlock } = await buildBrandContext(workspaceId);
    const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: [
            systemBlock,
            {
                type: 'text',
                text: 'You are a professional social media scriptwriter. Write compelling content that sounds human, not AI-generated. Respond with valid JSON only, no markdown fences.',
            },
        ],
        messages: [{ role: 'user', content: JSON.stringify(idea) }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100));
    }
}
