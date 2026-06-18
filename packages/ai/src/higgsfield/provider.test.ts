import { describe, it, expect, vi, beforeEach } from 'vitest'

const { submitSoul, submitTalking, submitMotion, poll, upload, submitFoundation } = vi.hoisted(() => ({
  submitSoul: vi.fn(),
  submitTalking: vi.fn(),
  submitMotion: vi.fn(),
  poll: vi.fn(),
  upload: vi.fn(),
  submitFoundation: vi.fn(),
}))

vi.mock('./client.js', () => ({
  submitSoulCharacterFrame: submitSoul,
  submitTalkingAvatarClip: submitTalking,
  submitImageToVideo: submitMotion,
  pollJobUntilDone: poll,
  uploadToHiggsfield: upload,
  submitFoundationImage: submitFoundation,
}))

import { HiggsfieldProvider } from './provider.js'

beforeEach(() => vi.clearAllMocks())

describe('HiggsfieldProvider', () => {
  it('characterFrame submits then polls and returns the image url', async () => {
    submitSoul.mockResolvedValue('job-1')
    poll.mockResolvedValue('https://hf/img.png')
    const p = new HiggsfieldProvider()
    const url = await p.characterFrame('a man', { characterId: 'soul-1', seed: 7 })
    expect(submitSoul).toHaveBeenCalledWith('a man', 'soul-1', { seed: 7 })
    expect(poll).toHaveBeenCalledWith('job-1')
    expect(url).toBe('https://hf/img.png')
  })

  it('talkingHead submits the speak job then polls', async () => {
    submitTalking.mockResolvedValue('job-2')
    poll.mockResolvedValue('https://hf/clip.mp4')
    const p = new HiggsfieldProvider()
    const url = await p.talkingHead({ imageUrl: 'i', audioUrl: 'a', prompt: 'p', audioDurationSec: 7 })
    expect(submitTalking).toHaveBeenCalledWith('i', 'a', 'p', 7)
    expect(url).toBe('https://hf/clip.mp4')
  })

  it('motionFromImage submits dop then polls', async () => {
    submitMotion.mockResolvedValue('job-3')
    poll.mockResolvedValue('https://hf/silent.mp4')
    const p = new HiggsfieldProvider()
    const url = await p.motionFromImage({ imageUrl: 'i', prompt: 'p', seed: 5 })
    expect(submitMotion).toHaveBeenCalledWith('i', 'p', { seed: 5 })
    expect(url).toBe('https://hf/silent.mp4')
  })

  it('sceneFrame submits foundation text2image then polls and returns the image url', async () => {
    submitFoundation.mockResolvedValue('job-4')
    poll.mockResolvedValue('https://hf/scene.png')
    const p = new HiggsfieldProvider()
    const url = await p.sceneFrame('city street, no people', { seed: 9 })
    expect(submitFoundation).toHaveBeenCalledWith('city street, no people', { seed: 9 })
    expect(poll).toHaveBeenCalledWith('job-4')
    expect(url).toBe('https://hf/scene.png')
  })
})
