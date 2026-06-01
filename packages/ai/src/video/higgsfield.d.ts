export interface VideoGenParams {
    prompt: string;
    durationSec?: number;
    aspectRatio?: '9:16' | '16:9' | '1:1';
}
export interface VideoGenResult {
    videoUrl: string;
}
export declare function submitVideoJob(params: VideoGenParams): Promise<string>;
export declare function pollVideoJob(jobId: string, options?: {
    intervalMs?: number;
    timeoutMs?: number;
}): Promise<VideoGenResult>;
export declare function generateVideo(params: VideoGenParams): Promise<VideoGenResult>;
//# sourceMappingURL=higgsfield.d.ts.map