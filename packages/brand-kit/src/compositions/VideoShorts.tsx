import { VideoReels } from './VideoReels.js'

// TikTok / YouTube Shorts share the same 9:16 format as Reels.
// This is a thin re-export so the template registry can use a distinct id.
export { VideoReels as VideoShorts }
