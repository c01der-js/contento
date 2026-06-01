export interface ContentIdea {
    title: string;
    angle: string;
    format: string;
    platform: string;
    rationale: string;
}
export declare function generateIdeas(workspaceId: string, trend: {
    title: string;
    description?: string;
}, count?: number): Promise<ContentIdea[]>;
//# sourceMappingURL=idea-generator.d.ts.map