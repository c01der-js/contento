import { describe, it, expect } from 'vitest'
import {
  chunkWords,
  buildShotProps,
  buildStitchProps,
  parseSubtitlesJson,
  STITCH_FPS,
} from './stitch-props.js'

const w = (text: string, startFrame: number, endFrame: number) => ({ text, startFrame, endFrame })

describe('chunkWords', () => {
  it('groups words into chunks of at most maxWords', () => {
    const words = [w('а', 0, 5), w('б', 5, 10), w('в', 10, 15), w('г', 15, 20), w('д', 20, 25)]
    const chunks = chunkWords(words, 4, 24)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.words.map(x => x.text)).toEqual(['а', 'б', 'в', 'г'])
    expect(chunks[1]!.words.map(x => x.text)).toEqual(['д'])
  })

  it('starts a new chunk on a long pause', () => {
    const words = [w('до', 0, 10), w('после', 60, 70)] // gap 50 frames > 24
    const chunks = chunkWords(words, 4, 24)
    expect(chunks).toHaveLength(2)
  })

  it('extends each chunk until the next one starts (hold on screen)', () => {
    const words = [w('a', 0, 10), w('b', 10, 20), w('c', 20, 30), w('d', 30, 40), w('e', 50, 60)]
    const chunks = chunkWords(words, 4, 24)
    expect(chunks[0]!.endFrame).toBe(50) // held until chunk 2 starts
    expect(chunks[1]!.endFrame).toBe(66) // last chunk: +6 frames hold
  })

  it('returns empty array for no words', () => {
    expect(chunkWords([], 4, 24)).toEqual([])
  })
})

describe('buildShotProps', () => {
  it('trims the clip to last word end + 0.4s (frozen Speak tail removal)', () => {
    // 10s clip, speech ends at 7.0s -> trim to 7.4s
    const timing = { index: 0, audioSec: 7, words: [{ text: 'конец', startSec: 6.5, endSec: 7.0 }] }
    const shot = buildShotProps('http://clip', 10, timing)
    expect(shot.durationInFrames).toBe(Math.round(7.4 * STITCH_FPS))
  })

  it('keeps full probed duration for silent shots', () => {
    const shot = buildShotProps('http://clip', 3.5, undefined)
    expect(shot.durationInFrames).toBe(Math.round(3.5 * STITCH_FPS))
    expect(shot.chunks).toEqual([])
  })

  it('never trims beyond the probed duration and clamps word frames into the shot', () => {
    const timing = {
      index: 0,
      audioSec: 9,
      words: [{ text: 'хвост', startSec: 8.8, endSec: 9.5 }], // ends past the 9s clip
    }
    const shot = buildShotProps('http://clip', 9, timing)
    expect(shot.durationInFrames).toBe(9 * STITCH_FPS)
    const lastWord = shot.chunks.at(-1)!.words.at(-1)!
    expect(lastWord.endFrame).toBeLessThanOrEqual(shot.durationInFrames)
  })
})

describe('parseSubtitlesJson', () => {
  it('accepts the v1 shape and rejects garbage', () => {
    const good = { version: 1, shots: [{ index: 0, audioSec: 2, words: [{ text: 'а', startSec: 0, endSec: 1 }] }] }
    expect(parseSubtitlesJson(good)?.shots).toHaveLength(1)
    expect(parseSubtitlesJson(null)).toBeUndefined()
    expect(parseSubtitlesJson({ version: 2 })).toBeUndefined()
    expect(parseSubtitlesJson({ version: 1, shots: 'nope' })).toBeUndefined()
  })
})

describe('buildStitchProps', () => {
  it('assembles props with brand colors and falls back to defaults', () => {
    const props = buildStitchProps({
      shots: [{ src: 'http://a', probedSec: 5 }],
      cta: 'Подпишись!',
      visual: { primaryColor: '#111111', secondaryColor: null, accentColor: '#ff0000', logoUrl: null },
    })
    expect(props.cta).toBe('Подпишись!')
    expect(props.primaryColor).toBe('#111111')
    expect(props.secondaryColor).toBe('#0d0d1a') // default
    expect(props.accentColor).toBe('#ff0000')
    expect(props.logoUrl).toBeUndefined()
    expect(props.shots).toHaveLength(1)
    expect(props.ctaDurationInFrames).toBe(75)
  })
})
