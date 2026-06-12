import { describe, it, expect } from 'vitest'
import { calcStitchDurationInFrames, DEFAULT_VIDEO_STITCH_PROPS } from './video-stitch-shared.js'

describe('calcStitchDurationInFrames', () => {
  it('sums shot durations plus CTA card', () => {
    const frames = calcStitchDurationInFrames({
      ...DEFAULT_VIDEO_STITCH_PROPS,
      shots: [
        { src: 'a', durationInFrames: 90, chunks: [] },
        { src: 'b', durationInFrames: 150, chunks: [] },
      ],
      ctaDurationInFrames: 75,
    })
    expect(frames).toBe(315)
  })

  it('never returns less than 1 frame', () => {
    expect(
      calcStitchDurationInFrames({ ...DEFAULT_VIDEO_STITCH_PROPS, shots: [], ctaDurationInFrames: 0 }),
    ).toBe(1)
  })
})
