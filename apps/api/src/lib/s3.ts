import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'

const s3 = new S3Client({
  endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'contento',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'contento123',
  },
  forcePathStyle: true,
})

export async function uploadBuffer(buf: Buffer, key: string, contentType: string): Promise<string> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  )
  const endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000'
  return `${endpoint}/${bucket}/${key}`
}

export interface S3ObjectStream {
  body: Readable
  contentType: string
  contentLength?: number | undefined
  contentRange?: string | undefined
  /** 206 when a Range was satisfied, else 200. */
  statusCode: number
}

/** Stream an object from S3/MinIO, optionally honoring an HTTP Range header (for video seeking). */
export async function getObjectStream(key: string, range?: string): Promise<S3ObjectStream> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }))
  return {
    body: res.Body as Readable,
    contentType: res.ContentType ?? 'application/octet-stream',
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
    statusCode: res.ContentRange ? 206 : 200,
  }
}

/** Extract the S3 object key from a path-style URL produced by uploadBuffer/uploadVideo. */
export function keyFromUrl(url: string): string {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const path = new URL(url).pathname.replace(/^\/+/, '')
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
}
