/**
 * Vendor-agnostic video generation. The worker depends on this, not on a concrete
 * vendor, so the lipsync/avatar engine can be swapped (Higgsfield / Sync.so / HeyGen)
 * by adding an implementation and selecting it via VIDEO_PROVIDER.
 */
export interface VideoProvider {
  /** Upload audio bytes and return a URL the provider can fetch (for lip-sync input). */
  uploadAudio(data: Buffer, contentType: string): Promise<string>
  /** Generate a still character frame; returns an image URL. */
  characterFrame(prompt: string, opts: { characterId: string; seed?: number }): Promise<string>
  /** Talking-head clip with lip-sync; returns a video clip URL. */
  talkingHead(opts: { imageUrl: string; audioUrl: string; prompt: string; audioDurationSec: number }): Promise<string>
  /** Silent motion clip from a still image; returns a video clip URL. */
  motionFromImage(opts: { imageUrl: string; prompt: string; seed?: number }): Promise<string>
  /** Generate a b-roll scene still from a text prompt (no character/Soul); returns an image URL. */
  sceneFrame(prompt: string, opts?: { seed?: number }): Promise<string>
}
