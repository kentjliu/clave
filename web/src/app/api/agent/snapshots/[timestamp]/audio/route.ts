import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken } from '@/lib/agent-auth';
import { getProjects, updateSnapshotAudio } from '@/lib/dynamo';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ timestamp: string }> },
) {
  const identity = await verifyAgentToken(req);
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { timestamp } = await params;
  const body = await req.json() as {
    project_id: string;
    status: string;
    s3_key?: string;
  };

  const projects = await getProjects(identity.userId);
  if (!projects.find((p) => p.project_id === body.project_id)) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (body.status === 'done' && body.s3_key) {
    await updateSnapshotAudio(body.project_id, timestamp, {
      status: 'done',
      s3Key: body.s3_key,
    });
  } else if (body.status === 'rendering' || body.status === 'failed') {
    await updateSnapshotAudio(body.project_id, timestamp, { status: body.status });
  } else {
    return NextResponse.json({ error: 'Invalid status or missing s3_key' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
