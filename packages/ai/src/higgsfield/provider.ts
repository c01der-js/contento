import type { VideoProvider } from '../video-provider.js'
import {
  submitSoulCharacterFrame,
  submitTalkingAvatarClip,
  submitImageToVideo,
  pollJobUntilDone,
  uploadToHiggsfield,
} from './client.js'

/** VideoProvider backed by Higgsfield (Soul + Speak + DoP). */
export class HiggsfieldProvider implements VideoProvider {
  uploadAudio(data: Buffer, contentType: string): Promise<string> {
    return uploadToHiggsfield(data, contentType)
  }

  async characterFrame(prompt: string, opts: { characterId: string; seed?: number }): Promise<string> {
    let jobSetId: string
    if (opts.seed != null) {
      jobSetId = await submitSoulCharacterFrame(prompt, opts.characterId, { seed: opts.seed })
    } else {
      jobSetId = await submitSoulCharacterFrame(prompt, opts.characterId)
    }
    return pollJobUntilDone(jobSetId)
  }

  async talkingHead(opts: { imageUrl: string; audioUrl: string; prompt: string; audioDurationSec: number }): Promise<string> {
    const jobSetId = await submitTalkingAvatarClip(opts.imageUrl, opts.audioUrl, opts.prompt, opts.audioDurationSec)
    return pollJobUntilDone(jobSetId)
  }

  async motionFromImage(opts: { imageUrl: string; prompt: string; seed?: number }): Promise<string> {
    let jobSetId: string
    if (opts.seed != null) {
      jobSetId = await submitImageToVideo(opts.imageUrl, opts.prompt, { seed: opts.seed })
    } else {
      jobSetId = await submitImageToVideo(opts.imageUrl, opts.prompt)
    }
    return pollJobUntilDone(jobSetId)
  }
}

/** Select the video provider. Only 'higgsfield' exists today; the env hook lets a future
 *  Sync.so/HeyGen impl be swapped in without touching the worker. */
export function createVideoProvider(name: string = process.env['VIDEO_PROVIDER'] ?? 'higgsfield'): VideoProvider {
  switch (name) {
    case 'higgsfield':
      return new HiggsfieldProvider()
    default:
      throw new Error(`Unknown VIDEO_PROVIDER: ${name}`)
  }
}
