import { withRetry, HttpStatusError } from '../retry.js'
import { alignmentToWords } from './alignment.js'
import type { WordTiming, CharacterAlignment } from './alignment.js'

const BASE_URL = 'https://api.elevenlabs.io/v1'

function apiKey(): string {
  const key = process.env['ELEVENLABS_API_KEY']
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  return key
}

/**
 * Convert text to speech using ElevenLabs.
 * Returns an MP3 buffer (mp3_44100_128 — available on Starter tier and above).
 */
export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const voiceToUse = voiceId || process.env['ELEVENLABS_VOICE_ID'] || ''
  if (!voiceToUse) throw new Error('ELEVENLABS_VOICE_ID is not set')

  return withRetry(async () => {
    const response = await fetch(
      `${BASE_URL}/text-to-speech/${voiceToUse}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey(),
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      throw new HttpStatusError(response.status, `ElevenLabs TTS error ${response.status}: ${err}`)
    }

    return Buffer.from(await response.arrayBuffer())
  })
}

export interface SpeechWithTimestamps {
  audio: Buffer
  words: WordTiming[]
}

/**
 * TTS with per-character timestamps (ElevenLabs /with-timestamps), collapsed to
 * word timings for subtitle burn-in. Same voice/model/format as synthesizeSpeech.
 */
export async function synthesizeSpeechWithTimestamps(
  text: string,
  voiceId: string,
): Promise<SpeechWithTimestamps> {
  const voiceToUse = voiceId || process.env['ELEVENLABS_VOICE_ID'] || ''
  if (!voiceToUse) throw new Error('ELEVENLABS_VOICE_ID is not set')

  return withRetry(async () => {
    const response = await fetch(
      `${BASE_URL}/text-to-speech/${voiceToUse}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey(),
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    )

    if (!response.ok) {
      const err = await response.text().catch(() => '')
      throw new HttpStatusError(response.status, `ElevenLabs TTS error ${response.status}: ${err}`)
    }

    const data = (await response.json()) as {
      audio_base64?: string
      alignment?: CharacterAlignment | null
    }
    if (!data.audio_base64) throw new Error('ElevenLabs with-timestamps response missing audio_base64')

    return {
      audio: Buffer.from(data.audio_base64, 'base64'),
      words: data.alignment ? alignmentToWords(data.alignment) : [],
    }
  })
}
