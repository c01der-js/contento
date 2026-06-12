import { describe, it, expect } from 'vitest'
import { mockWavBuffer } from './mock.js'
import { wavDurationSec, speakDurationFor } from './audio.js'

describe('wavDurationSec', () => {
  it('returns 0 for the empty mock WAV', () => {
    expect(wavDurationSec(mockWavBuffer())).toBe(0)
  })

  it('computes duration from data chunk size and byte rate', () => {
    // mock header: PCM16 mono 44.1kHz => byteRate 88200; append 3s of data
    const header = mockWavBuffer()
    const dataBytes = 88200 * 3
    const wav = Buffer.concat([header, Buffer.alloc(dataBytes)])
    wav.writeUInt32LE(36 + dataBytes, 4) // RIFF size
    wav.writeUInt32LE(dataBytes, 40) // data chunk size
    expect(wavDurationSec(wav)).toBeCloseTo(3)
  })

  it('throws on a non-WAV buffer', () => {
    expect(() => wavDurationSec(Buffer.from('definitely not a wav file'))).toThrow(/RIFF/)
  })
})

describe('speakDurationFor', () => {
  it.each([
    [0.5, 5],
    [5, 5],
    [5.1, 10],
    [10, 10],
    [10.1, 15],
    [60, 15],
  ])('maps %s sec of audio to allowed duration %s', (audioSec, expected) => {
    expect(speakDurationFor(audioSec)).toBe(expected)
  })
})
