export interface ContentScript {
    hook: string;
    body: string;
    cta: string;
    caption: string;
    hashtags: string[];
}
export declare function writeScript(workspaceId: string, idea: {
    title: string;
    angle: string;
    format: string;
    platform: string;
}): Promise<ContentScript>;
//# sourceMappingURL=scriptwriter.d.ts.map