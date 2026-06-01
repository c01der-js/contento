import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Composition } from 'remotion';
import { SingleImagePost } from './compositions/SingleImagePost.js';
import { QuotePost } from './compositions/QuotePost.js';
import { NewsCard } from './compositions/NewsCard.js';
import { CarouselPost } from './compositions/CarouselPost.js';
import { StoryPost } from './compositions/StoryPost.js';
import { VideoReels } from './compositions/VideoReels.js';
import { VideoReels as VideoShorts } from './compositions/VideoReels.js';
import { VideoSquare } from './compositions/VideoSquare.js';
import { VideoHorizontal } from './compositions/VideoHorizontal.js';
import { TEMPLATE_CONFIG } from './templates/config.js';
const DEFAULT_PROPS = {
    hook: 'Your hook goes here',
    caption: 'Caption text',
    hashtags: ['brand', 'content'],
};
const COMPONENTS = {
    SingleImagePost: SingleImagePost,
    QuotePost: QuotePost,
    NewsCard: NewsCard,
    CarouselPost: CarouselPost,
    StoryPost: StoryPost,
    VideoReels: VideoReels,
    VideoShorts: VideoShorts,
    VideoSquare: VideoSquare,
    VideoHorizontal: VideoHorizontal,
};
export function RemotionRoot() {
    return (_jsx(_Fragment, { children: TEMPLATE_CONFIG.map(({ id, width, height, fps, durationInFrames }) => (_jsx(Composition, { id: id, component: COMPONENTS[id], durationInFrames: durationInFrames, fps: fps, width: width, height: height, defaultProps: DEFAULT_PROPS }, id))) }));
}
