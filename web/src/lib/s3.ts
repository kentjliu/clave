import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION_NAME });
const BUCKET = process.env.S3_BUCKET!;

export async function getDownloadUrl(userId: string, projectId: string, hash: string): Promise<string> {
  const key = `${userId}/${projectId}/${hash}.flp`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
}
