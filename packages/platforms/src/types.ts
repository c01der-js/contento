export interface PublishPayload {
  text: string          // caption/message text
  imageUrl?: string     // URL of the rendered image (PNG)
  videoUrl?: string     // URL of the rendered video (MP4); preferred over imageUrl when set
  hashtags?: string[]   // optional, append to text if platform doesn't handle separately
}

export interface PublishResult {
  platformPostId: string  // ID returned by platform
  url?: string            // direct URL to the post (if available)
}

export interface PlatformPublisher {
  publish(payload: PublishPayload): Promise<PublishResult>
}
