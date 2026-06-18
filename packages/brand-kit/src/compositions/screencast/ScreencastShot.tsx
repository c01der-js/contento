import type { ScreencastContent } from '../video-stitch-shared.js'
import { SlidesScreen } from './SlidesScreen.js'
import { ChatScreen } from './ChatScreen.js'
import { BrowserScreen } from './BrowserScreen.js'
import { PhoneAppScreen } from './PhoneAppScreen.js'

export function ScreencastShot({
  content,
  primaryColor,
  secondaryColor,
  accentColor,
}: {
  content: ScreencastContent
  primaryColor: string
  secondaryColor: string
  accentColor: string
}) {
  const colors = { primaryColor, secondaryColor, accentColor }
  switch (content.template) {
    case 'chat':
      return <ChatScreen content={content} {...colors} />
    case 'browser':
      return <BrowserScreen content={content} {...colors} />
    case 'phone-app':
      return <PhoneAppScreen content={content} {...colors} />
    case 'slides':
    default:
      return <SlidesScreen content={content} {...colors} />
  }
}
