export interface TrendAnalysis {
    score: number;
    summary: string;
    angles: string[];
    risks: string[];
    category?: string;
}
export declare function analyzeTrend(workspaceId: string, trend: {
    title: string;
    description?: string;
    url?: string;
}): Promise<TrendAnalysis>;
//# sourceMappingURL=trend-analyzer.d.ts.map