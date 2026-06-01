export interface TemplateConfig {
    id: string;
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
    label: string;
    format: 'square' | 'portrait' | 'story' | 'video-reels' | 'video-shorts' | 'video-square' | 'video-horizontal';
}
export declare const TEMPLATE_CONFIG: [{
    readonly id: "SingleImagePost";
    readonly width: 1080;
    readonly height: 1080;
    readonly fps: 30;
    readonly durationInFrames: 1;
    readonly label: "Single Image";
    readonly format: "square";
}, {
    readonly id: "QuotePost";
    readonly width: 1080;
    readonly height: 1080;
    readonly fps: 30;
    readonly durationInFrames: 1;
    readonly label: "Quote Card";
    readonly format: "square";
}, {
    readonly id: "NewsCard";
    readonly width: 1080;
    readonly height: 1350;
    readonly fps: 30;
    readonly durationInFrames: 1;
    readonly label: "News Card";
    readonly format: "portrait";
}, {
    readonly id: "CarouselPost";
    readonly width: 1080;
    readonly height: 1080;
    readonly fps: 30;
    readonly durationInFrames: 1;
    readonly label: "Carousel";
    readonly format: "square";
}, {
    readonly id: "StoryPost";
    readonly width: 1080;
    readonly height: 1920;
    readonly fps: 30;
    readonly durationInFrames: 1;
    readonly label: "Story";
    readonly format: "story";
}, {
    readonly id: "VideoReels";
    readonly width: 1080;
    readonly height: 1920;
    readonly fps: 30;
    readonly durationInFrames: 360;
    readonly label: "Video Reels";
    readonly format: "video-reels";
}, {
    readonly id: "VideoShorts";
    readonly width: 1080;
    readonly height: 1920;
    readonly fps: 30;
    readonly durationInFrames: 360;
    readonly label: "Video Shorts";
    readonly format: "video-shorts";
}, {
    readonly id: "VideoSquare";
    readonly width: 1080;
    readonly height: 1080;
    readonly fps: 30;
    readonly durationInFrames: 300;
    readonly label: "Video Square";
    readonly format: "video-square";
}, {
    readonly id: "VideoHorizontal";
    readonly width: 1920;
    readonly height: 1080;
    readonly fps: 30;
    readonly durationInFrames: 360;
    readonly label: "Video Horizontal";
    readonly format: "video-horizontal";
}];
export declare function getTemplateConfig(templateId: string): TemplateConfig;
//# sourceMappingURL=config.d.ts.map