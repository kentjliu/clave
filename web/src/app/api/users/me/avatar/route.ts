import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION_NAME });
const AVATARS_BUCKET = process.env.S3_AVATARS_BUCKET!;

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { contentType } = await req.json() as { contentType: string };

  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 });
  }

  const ext = contentType.split('/')[1];
  const key = `avatars/${session.user.id}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: AVATARS_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  const avatarUrl = `https://${AVATARS_BUCKET}.s3.${process.env.AWS_REGION_NAME}.amazonaws.com/${key}`;

  return NextResponse.json({ uploadUrl, avatarUrl });
}
