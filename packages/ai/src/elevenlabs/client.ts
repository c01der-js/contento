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
    throw new Error(`ElevenLabs TTS error ${response.status}: ${err}`)
  }

  return Buffer.from(await response.arrayBuffer())
}
