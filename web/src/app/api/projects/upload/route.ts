import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createProject, createSnapshot, getProfile, writeActivity } from '@/lib/dynamo';
import { getUploadUrl } from '@/lib/s3';
import { randomUUID } from 'crypto';

function makeTimestamp(): string {
  // Match CLI format: 2026-04-14T14-32-10
  return new Date().toISOString().replace(/T(\d{2}):(\d{2}):(\d{2}).*/, 'T$1-$2-$3');
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, filename, hash, file_size } = await req.json() as {
    name: string;
    filename: string;
    hash: string;
    file_size: number;
  };

  if (!name || !filename || !hash || !file_size) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const userId = session.user.id;
  const projectId = randomUUID();
  const timestamp = makeTimestamp();
  const s3Key = `${userId}/${projectId}/${hash}.flp`;

  await createProject({
    user_id: userId,
    project_id: projectId,
    name,
    flp_path: filename,
    s3_prefix: `${userId}/${projectId}/`,
  });

  await createSnapshot({
    project_id: projectId,
    timestamp,
    user_id: userId,
    hash,
    file_size,
    s3_key: s3Key,
  });

  // Write activity events (best-effort — don't fail the upload if this errors).
  getProfile(userId).then((profile) => {
    if (!profile) return;
    const base = {
      user_id:      userId,
      project_id:   projectId,
      project_name: name,
      project_visibility: 'public' as const,
      username:     profile.username,
      display_name: profile.display_name,
      avatar_url:   profile.avatar_url,
    };
    const now = new Date().toISOString();
    Promise.all([
      writeActivity({ ...base, type: 'project_created',  created_at: now }),
      writeActivity({ ...base, type: 'snapshot_created', created_at: new Date(Date.now() + 1).toISOString() }),
    ]).catch(() => {});
  }).catch(() => {});

  const upload_url = await getUploadUrl(s3Key);

  return NextResponse.json({ project_id: projectId, upload_url });
}
