// Presign helper for the posting-service. VideoJob.outputUrl is a path-style
// MinIO/S3 URL on a PRIVATE bucket. External platforms (TikTok PULL_FROM_URL,
// YouTube fetch, Instagram video_url) must fetch the asset over the public
// internet, so we presign a short-lived GET URL. Mirrors apps/video-worker/src/s3-client.ts.
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({
  endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'contento',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'contento123',
  },
  forcePathStyle: true,
})

/** Extract the S3 object key from a path-style URL produced by uploadVideo/uploadBuffer. */
export function keyFromUrl(url: string): string {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const path = new URL(url).pathname.replace(/^\/+/, '')
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
}

/** True when the URL points at our S3/MinIO endpoint (a private bucket needing presign). */
export function isOwnS3Url(url: string): boolean {
  const endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000'
  return url.startsWith(`${endpoint}/`)
}

/** Presigned GET URL so an external platform's servers can download the video. */
export async function presignGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSignedUrl(s3 as any, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec })
}
