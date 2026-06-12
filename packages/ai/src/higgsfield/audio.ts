/**
 * Duration of a PCM WAV buffer in seconds, derived from the RIFF header
 * (data chunk size / fmt byte rate). Works on the canonical 44-byte header
 * that ffmpeg's `-f wav` emits, and tolerates extra chunks before `data`.
 */
export function wavDurationSec(wav: Buffer): number {
  if (
    wav.length < 44 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('wavDurationSec: buffer is not a RIFF/WAVE file')
  }
  let byteRate = 0
  let offset = 12
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4)
    const chunkSize = wav.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ') byteRate = wav.readUInt32LE(offset + 16)
    if (chunkId === 'data') {
      if (byteRate === 0) throw new Error('wavDurationSec: fmt chunk not found before data')
      return chunkSize / byteRate
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  throw new Error('wavDurationSec: data chunk not found')
}

/** The only durations Higgsfield Speak accepts (per official SDK SpeakDuration enum). */
export type SpeakDuration = 5 | 10 | 15

/**
 * Smallest allowed Speak duration that fits the audio. Audio longer than 15s
 * is clamped — the storyboard agent should keep dialogue under ~15s per shot.
 */
export function speakDurationFor(audioSec: number): SpeakDuration {
  if (audioSec <= 5) return 5
  if (audioSec <= 10) return 10
  return 15
}
