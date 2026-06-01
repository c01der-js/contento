import { Composition } from 'remotion'
import { SingleImagePost } from './compositions/SingleImagePost.js'
import { QuotePost } from './compositions/QuotePost.js'
import { NewsCard } from './compositions/NewsCard.js'
import { CarouselPost } from './compositions/CarouselPost.js'
import { StoryPost } from './compositions/StoryPost.js'
import { VideoReels } from './compositions/VideoReels.js'
import { VideoReels as VideoShorts } from './compositions/VideoReels.js'
import { VideoSquare } from './compositions/VideoSquare.js'
import { VideoHorizontal } from './compositions/VideoHorizontal.js'
import { TEMPLATE_CONFIG } from './templates/config.js'
import type { BrandCardProps } from './types.js'

const DEFAULT_PROPS: BrandCardProps = {
  hook: 'Your hook goes here',
  caption: 'Caption text',
  hashtags: ['brand', 'content'],
}

type AnyFC = React.FC<Record<string, unknown>>
type TemplateId = (typeof TEMPLATE_CONFIG)[number]['id']

const COMPONENTS: Record<TemplateId, AnyFC> = {
  SingleImagePost: SingleImagePost as unknown as AnyFC,
  QuotePost: QuotePost as unknown as AnyFC,
  NewsCard: NewsCard as unknown as AnyFC,
  CarouselPost: CarouselPost as unknown as AnyFC,
  StoryPost: StoryPost as unknown as AnyFC,
  VideoReels: VideoReels as unknown as AnyFC,
  VideoShorts: VideoShorts as unknown as AnyFC,
  VideoSquare: VideoSquare as unknown as AnyFC,
  VideoHorizontal: VideoHorizontal as unknown as AnyFC,
}

export function RemotionRoot() {
  return (
    <>
      {TEMPLATE_CONFIG.map(({ id, width, height, fps, durationInFrames }) => (
        <Composition
          key={id}
          id={id}
          component={COMPONENTS[id]!}
          durationInFrames={durationInFrames}
          fps={fps}
          width={width}
          height={height}
          defaultProps={DEFAULT_PROPS}
        />
      ))}
    </>
  )
}
