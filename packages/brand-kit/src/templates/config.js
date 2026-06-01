export const TEMPLATE_CONFIG = [
    { id: 'SingleImagePost', width: 1080, height: 1080, fps: 30, durationInFrames: 1, label: 'Single Image', format: 'square' },
    { id: 'QuotePost', width: 1080, height: 1080, fps: 30, durationInFrames: 1, label: 'Quote Card', format: 'square' },
    { id: 'NewsCard', width: 1080, height: 1350, fps: 30, durationInFrames: 1, label: 'News Card', format: 'portrait' },
    { id: 'CarouselPost', width: 1080, height: 1080, fps: 30, durationInFrames: 1, label: 'Carousel', format: 'square' },
    { id: 'StoryPost', width: 1080, height: 1920, fps: 30, durationInFrames: 1, label: 'Story', format: 'story' },
    { id: 'VideoReels', width: 1080, height: 1920, fps: 30, durationInFrames: 360, label: 'Video Reels', format: 'video-reels' },
    { id: 'VideoShorts', width: 1080, height: 1920, fps: 30, durationInFrames: 360, label: 'Video Shorts', format: 'video-shorts' },
    { id: 'VideoSquare', width: 1080, height: 1080, fps: 30, durationInFrames: 300, label: 'Video Square', format: 'video-square' },
    { id: 'VideoHorizontal', width: 1920, height: 1080, fps: 30, durationInFrames: 360, label: 'Video Horizontal', format: 'video-horizontal' },
];
export function getTemplateConfig(templateId) {
    return TEMPLATE_CONFIG.find(t => t.id === templateId) ?? TEMPLATE_CONFIG[0];
}
