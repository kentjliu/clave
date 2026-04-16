import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken } from '@/lib/agent-auth';
import { getProjects } from '@/lib/dynamo';
import { getAudioUploadUrl } from '@/lib/s3';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ timestamp: string }> },
) {
  const identity = await verifyAgentToken(req);
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { timestamp } = await params;
  const { project_id } = await req.json() as { project_id: string };

  const projects = await getProjects(identity.userId);
  if (!projects.find((p) => p.project_id === project_id)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const s3Key = `audio/${identity.userId}/${project_id}/${timestamp}.mp3`;
  const upload_url = await getAudioUploadUrl(s3Key);

  return NextResponse.json({ upload_url, s3_key: s3Key });
}
