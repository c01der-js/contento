import { join } from 'path'
import { tmpdir } from 'os'
import { stat } from 'fs/promises'
import { renderStitchVideo } from '../src/remotion-stitch.js'
import type { VideoStitchProps } from '@contento/brand-kit'

// Manual end-to-end check of the Remotion stitch: bundles the brand-kit project,
// renders one talking-style shot (a public sample clip) with burned-in karaoke
// subtitles + a branded CTA card, and asserts a non-trivial MP4 was produced.
// First run downloads Remotion's headless Chromium (~150MB) and webpack-bundles —
// expect several minutes. Run: pnpm --filter @contento/video-worker exec tsx scripts/render-smoke.ts
const props: VideoStitchProps = {
  shots: [
    {
      src: 'https://www.w3schools.com/html/mov_bbb.mp4',
      durationInFrames: 90,
      chunks: [
        {
          startFrame: 5,
          endFrame: 85,
          words: [
            { text: 'Привет,', startFrame: 5, endFrame: 30 },
            { text: 'это', startFrame: 30, endFrame: 50 },
            { text: 'смоук-тест!', startFrame: 50, endFrame: 80 },
          ],
        },
      ],
    },
    {
      // b-roll shot: short clip looped to fill a longer voiceover, with headline overlay.
      src: 'https://www.w3schools.com/html/mov_bbb.mp4',
      durationInFrames: 90,
      clipDurationInFrames: 30, // loop the 1-second clip 3× to fill 3 seconds
      audioSrc: 'https://www.w3schools.com/html/mov_bbb.mp4',
      headline: 'Заголовок б-ролла',
      chunks: [
        {
          startFrame: 0,
          endFrame: 80,
          words: [
            { text: 'б-ролл', startFrame: 0, endFrame: 40 },
            { text: 'работает', startFrame: 40, endFrame: 80 },
          ],
        },
      ],
    },
  ],
  cta: 'Подпишись на канал',
  ctaDurationInFrames: 60,
  primaryColor: '#1a1a2e',
  secondaryColor: '#0d0d1a',
  accentColor: '#e94560',
}

const out = join(tmpdir(), 'contento-stitch-smoke.mp4')
console.log('[smoke] rendering to', out)
await renderStitchVideo(props, out)
const { size } = await stat(out)
if (size < 50_000) throw new Error(`[smoke] output suspiciously small: ${size} bytes`)
console.log(`[smoke] OK — ${out} (${(size / 1024).toFixed(0)} KB)`)
