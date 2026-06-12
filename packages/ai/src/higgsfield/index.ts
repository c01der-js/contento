export {
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  generateCharacterPortrait,
  uploadToHiggsfield,
  buildSoulParams,
  buildSpeakParams,
  buildDopParams,
} from './client.js'
export type { SoulFrameOptions } from './client.js'
export { isMockMode, MOCK_CLIP_URL, MOCK_IMAGE_URL, mockWavBuffer } from './mock.js'
export { wavDurationSec, speakDurationFor } from './audio.js'
export type { SpeakDuration } from './audio.js'
export { verifyWebhookSignature } from './verify.js'
export type { HiggsfieldJobStatus, HiggsfieldJobResult, HiggsfieldWebhookPayload } from './types.js'
