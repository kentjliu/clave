import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getSnapshots } from '@/lib/dynamo';
import { getDownloadUrl } from '@/lib/s3';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; timestamp: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId, timestamp } = await params;

  // Verify project ownership.
  const projects = await getProjects(session.user.id);
  const project = projects.find((p) => p.project_id === projectId);
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Find the specific snapshot.
  const snapshots = await getSnapshots(projectId);
  const snapshot = snapshots.find((s) => s.timestamp === decodeURIComponent(timestamp));
  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  const url = await getDownloadUrl(session.user.id, projectId, snapshot.hash);
  return NextResponse.json({ url });
}
