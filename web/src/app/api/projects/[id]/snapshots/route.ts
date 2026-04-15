import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getSnapshots } from '@/lib/dynamo';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Verify the project belongs to the authenticated user.
  const projects = await getProjects(session.user.id);
  const project = projects.find((p) => p.project_id === projectId);
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const snapshots = await getSnapshots(projectId);
  return NextResponse.json(snapshots);
}
