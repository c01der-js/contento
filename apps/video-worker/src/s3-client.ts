import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { readFile } from 'fs/promises'

const s3 = new S3Client({
  endpoint: process.env['S3_ENDPOINT'] ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY'] ?? 'contento',
    secretAccessKey: process.env['S3_SECRET_KEY'] ?? 'contento123',
  },
  forcePathStyle: true,
})

export async function uploadVideo(localPath: string, key: string): Promise<string> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const body = await readFile(localPath)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'video/mp4',
    }),
  )
  const endpoint = process.env['S3_ENDPOINT'] ?? 'http://localhost:9000'
  return `${endpoint}/${bucket}/${key}`
}

/** Read an object from S3/MinIO by key, authenticated (the bucket is not public-read). */
export async function downloadBuffer(key: string): Promise<Buffer> {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!res.Body) throw new Error(`S3 object ${key} has no body`)
  const bytes = await res.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/** Extract the S3 object key from a path-style URL produced by uploadBuffer/uploadVideo. */
export function keyFromUrl(url: string): string {
  const bucket = process.env['S3_BUCKET'] ?? 'renders'
  const path = new URL(url).pathname.replace(/^\/+/, '') // "bucket/key/..."
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path
}

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
