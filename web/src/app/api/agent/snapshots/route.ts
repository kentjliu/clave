import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken } from '@/lib/agent-auth';
import { getProjects, createSnapshot, getProfile, writeActivity } from '@/lib/dynamo';
import { getUploadUrl } from '@/lib/s3';

function makeTimestamp(): string {
  return new Date().toISOString().replace(/T(\d{2}):(\d{2}):(\d{2}).*/, 'T$1-$2-$3');
}

export async function POST(req: NextRequest) {
  const identity = await verifyAgentToken(req);
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { project_id, hash, file_size, metadata } = await req.json() as {
    project_id: string;
    hash: string;
    file_size: number;
    metadata?: Record<string, unknown>;
  };

  if (!project_id || !hash || !file_size) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify the project belongs to this user.
  const projects = await getProjects(identity.userId);
  if (!projects.find((p) => p.project_id === project_id)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const timestamp = makeTimestamp();
  const s3Key = `${identity.userId}/${project_id}/${hash}.flp`;

  const project = projects.find((p) => p.project_id === project_id)!;

  await createSnapshot({
    project_id,
    timestamp,
    user_id: identity.userId,
    hash,
    file_size,
    s3_key: s3Key,
  });

  // Write activity event (best-effort).
  getProfile(identity.userId).then((profile) => {
    if (!profile) return;
    writeActivity({
      user_id:            identity.userId,
      created_at:         new Date().toISOString(),
      type:               'snapshot_created',
      project_id,
      project_name:       project.name,
      project_visibility: project.visibility ?? 'public',
      username:           profile.username,
      display_name:       profile.display_name,
      avatar_url:         profile.avatar_url,
    }).catch(() => {});
  }).catch(() => {});

  const upload_url = await getUploadUrl(s3Key);

  return NextResponse.json({ timestamp, upload_url });
}
