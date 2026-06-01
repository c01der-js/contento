import { z } from 'zod';
declare const BrandCheckResultSchema: z.ZodObject<{
    overallScore: z.ZodNumber;
    passed: z.ZodBoolean;
    summary: z.ZodString;
    criteria: z.ZodObject<{
        tone: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
        vocabulary: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
        pillar: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
        persona: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
        visual: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
        legal: z.ZodObject<{
            score: z.ZodNumber;
            passed: z.ZodBoolean;
            issues: z.ZodArray<z.ZodString, "many">;
            suggestions: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }, {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        }>;
    }, "strip", z.ZodTypeAny, {
        persona: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        vocabulary: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        tone: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        pillar: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        visual: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        legal: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
    }, {
        persona: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        vocabulary: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        tone: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        pillar: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        visual: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        legal: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
    }>;
    autoFixes: z.ZodOptional<z.ZodObject<{
        hook: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        cta: z.ZodOptional<z.ZodString>;
        caption: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        hook?: string | undefined;
        body?: string | undefined;
        cta?: string | undefined;
        caption?: string | undefined;
    }, {
        hook?: string | undefined;
        body?: string | undefined;
        cta?: string | undefined;
        caption?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    summary: string;
    overallScore: number;
    passed: boolean;
    criteria: {
        persona: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        vocabulary: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        tone: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        pillar: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        visual: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        legal: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
    };
    autoFixes?: {
        hook?: string | undefined;
        body?: string | undefined;
        cta?: string | undefined;
        caption?: string | undefined;
    } | undefined;
}, {
    summary: string;
    overallScore: number;
    passed: boolean;
    criteria: {
        persona: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        vocabulary: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        tone: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        pillar: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        visual: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
        legal: {
            passed: boolean;
            issues: string[];
            score: number;
            suggestions: string[];
        };
    };
    autoFixes?: {
        hook?: string | undefined;
        body?: string | undefined;
        cta?: string | undefined;
        caption?: string | undefined;
    } | undefined;
}>;
export type BrandCheckResult = z.infer<typeof BrandCheckResultSchema>;
export declare function checkBrand(workspaceId: string, script: {
    hook: string;
    body: string;
    cta: string;
    caption: string;
}): Promise<BrandCheckResult>;
export {};
//# sourceMappingURL=brand-checker.d.ts.map