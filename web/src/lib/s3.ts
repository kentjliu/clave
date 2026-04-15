import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION_NAME });
const BUCKET = process.env.S3_BUCKET!;

export async function getDownloadUrl(userId: string, projectId: string, hash: string): Promise<string> {
  const key = `${userId}/${projectId}/${hash}.flp`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
}

export async function getUploadUrl(s3Key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: 'application/octet-stream' }),
    { expiresIn: 300 },
  );
}
