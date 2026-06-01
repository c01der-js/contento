import { prisma } from '@contento/db';
export async function buildBrandContext(workspaceId) {
    const [tones, pillars, vocabulary, personas, visualIdentity] = await Promise.all([
        prisma.brandTone.findMany({ where: { workspaceId } }),
        prisma.brandPillar.findMany({ where: { workspaceId } }),
        prisma.brandVocabulary.findMany({ where: { workspaceId } }),
        prisma.persona.findMany({ where: { workspaceId } }),
        prisma.visualIdentity.findUnique({ where: { workspaceId } }),
    ]);
    const lines = ['## Brand Knowledge Base'];
    if (tones.length > 0) {
        lines.push('\n### Voice & Tone');
        for (const t of tones) {
            lines.push(`- **${t.name}**: ${t.description ?? ''}`);
            if (t.examples.length > 0)
                lines.push(`  Examples: ${t.examples.join(' | ')}`);
        }
    }
    if (pillars.length > 0) {
        lines.push('\n### Content Pillars');
        for (const p of pillars) {
            lines.push(`- **${p.name}**: ${p.description ?? ''}`);
            if (p.keywords.length > 0)
                lines.push(`  Keywords: ${p.keywords.join(', ')}`);
        }
    }
    const allowed = vocabulary.filter(v => v.type === 'ALLOW');
    const forbidden = vocabulary.filter(v => v.type === 'FORBID');
    if (allowed.length > 0 || forbidden.length > 0) {
        lines.push('\n### Vocabulary');
        if (allowed.length > 0)
            lines.push(`- Use: ${allowed.map(v => v.word).join(', ')}`);
        if (forbidden.length > 0)
            lines.push(`- Avoid: ${forbidden.map(v => v.word).join(', ')}`);
    }
    if (personas.length > 0) {
        lines.push('\n### Target Audience');
        for (const p of personas) {
            lines.push(`- **${p.name}**: ${p.description ?? ''}`);
            if (p.painPoints.length > 0)
                lines.push(`  Pain points: ${p.painPoints.join('; ')}`);
            if (p.desires.length > 0)
                lines.push(`  Desires: ${p.desires.join('; ')}`);
        }
    }
    if (visualIdentity) {
        lines.push('\n### Visual Identity');
        if (visualIdentity.primaryColor)
            lines.push(`- Primary color: ${visualIdentity.primaryColor}`);
        if (visualIdentity.fontPrimary)
            lines.push(`- Primary font: ${visualIdentity.fontPrimary}`);
    }
    const text = lines.join('\n');
    return {
        systemBlock: {
            type: 'text',
            text,
            cache_control: { type: 'ephemeral' },
        },
        fetchedAt: new Date().toISOString(),
    };
}
