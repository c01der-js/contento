import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
export interface BrandContext {
    /** Ready-to-use system message block with cache_control set */
    systemBlock: TextBlockParam & {
        cache_control: {
            type: 'ephemeral';
        };
    };
    /** ISO timestamp for cache invalidation logging */
    fetchedAt: string;
}
export declare function buildBrandContext(workspaceId: string): Promise<BrandContext>;
//# sourceMappingURL=brand-context.d.ts.map