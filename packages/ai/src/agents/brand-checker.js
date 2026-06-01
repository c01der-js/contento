import { z } from 'zod';
import { getAnthropicClient } from '../client.js';
import { buildBrandContext } from '../brand-context.js';
const CriterionSchema = z.object({
    score: z.number().min(0).max(100),
    passed: z.boolean(),
    issues: z.array(z.string()),
    suggestions: z.array(z.string()),
});
const BrandCheckResultSchema = z.object({
    overallScore: z.number().min(0).max(100),
    passed: z.boolean(),
    summary: z.string(),
    criteria: z.object({
        tone: CriterionSchema,
        vocabulary: CriterionSchema,
        pillar: CriterionSchema,
        persona: CriterionSchema,
        visual: CriterionSchema,
        legal: CriterionSchema,
    }),
    autoFixes: z
        .object({
        hook: z.string().optional(),
        body: z.string().optional(),
        cta: z.string().optional(),
        caption: z.string().optional(),
    })
        .optional(),
});
export async function checkBrand(workspaceId, script) {
    const client = getAnthropicClient();
    const { systemBlock } = await buildBrandContext(workspaceId);
    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: [
            systemBlock,
            {
                type: 'text',
                text: 'You are a brand compliance checker. Evaluate this script across 6 criteria: tone (voice match), vocabulary (allowed/forbidden words), pillar (brand pillar alignment), persona (target audience fit), visual (visual consistency hints), legal (forbidden claims, regulated language). For each criterion provide score 0-100, passed (true if score>=70), issues array, suggestions array. Also provide overallScore (weighted average), passed (true if overallScore>=70), summary string, and optional autoFixes object with improved rewrites for hook/body/cta/caption if score < 70. Respond with valid JSON only, no markdown.',
            },
        ],
        messages: [{ role: 'user', content: JSON.stringify(script) }],
    });
    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    try {
        return BrandCheckResultSchema.parse(JSON.parse(text));
    }
    catch {
        throw new Error('Agent returned invalid JSON: ' + text.slice(0, 100));
    }
}
