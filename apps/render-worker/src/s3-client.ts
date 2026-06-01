import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFile } from 'fs/promises'

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'contento',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'contento123',
  },
  forcePathStyle: true, // required for MinIO
})

export async function uploadFile(localPath: string, key: string): Promise<string> {
  const bucket = process.env.S3_BUCKET ?? 'renders'
  const body = await readFile(localPath)
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/png',
    }),
  )
  const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000'
  return `${endpoint}/${bucket}/${key}`
}
