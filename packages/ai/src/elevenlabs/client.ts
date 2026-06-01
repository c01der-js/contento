const BASE_URL = 'https://api.elevenlabs.io/v1'

function apiKey(): string {
  const key = process.env['ELEVENLABS_API_KEY']
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set')
  return key
}

/** Wrap raw 16-bit PCM samples in a minimal WAV container. */
function pcmToWav(pcm: Buffer, sampleRate = 44100, channels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44)
  const dataLen = pcm.length
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)               // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28)
  header.writeUInt16LE(channels * (bitDepth / 8), 32)
  header.writeUInt16LE(bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLen, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Convert text to speech using ElevenLabs.
 * Returns a WAV buffer ready for upload to S3 and submission to Higgsfield Speak.
 */
export async function synthesizeSpeech(text: string, voiceId: string): Promise<Buffer> {
  const voiceToUse = voiceId || process.env['ELEVENLABS_VOICE_ID'] || ''
  if (!voiceToUse) throw new Error('ELEVENLABS_VOICE_ID is not set')

  const response = await fetch(
    `${BASE_URL}/text-to-speech/${voiceToUse}?output_format=pcm_44100`,
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

  const pcm = Buffer.from(await response.arrayBuffer())
  return pcmToWav(pcm)
}
