import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, updateSnapshotSummary } from '@/lib/dynamo';

type Params = { params: Promise<{ id: string; timestamp: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, timestamp } = await params;

  const projects = await getProjects(session.user.id);
  if (!projects.find((p) => p.project_id === projectId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { summary } = await req.json() as { summary: string };
  if (typeof summary !== 'string') {
    return NextResponse.json({ error: 'summary must be a string' }, { status: 400 });
  }

  await updateSnapshotSummary(projectId, decodeURIComponent(timestamp), summary.trim());
  return NextResponse.json({ ok: true });
}
