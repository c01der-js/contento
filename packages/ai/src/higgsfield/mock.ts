export function isMockMode(): boolean {
  return process.env['HIGGSFIELD_MOCK'] === '1'
}

/** Stable public placeholder MP4 used only in mock/test mode */
export const MOCK_CLIP_URL = 'https://www.w3schools.com/html/mov_bbb.mp4'

/** Stable public placeholder image URL used only in mock/test mode */
export const MOCK_IMAGE_URL = 'https://placehold.co/1536x2048/png'

/** Placeholder WAV buffer (44 bytes — a valid silent WAV header with 0 data) */
export function mockWavBuffer(): Buffer {
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(44100, 24)
  buf.writeUInt32LE(88200, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(0, 40)
  return buf
}
