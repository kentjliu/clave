import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, setWatchPath } from '@/lib/dynamo';

async function resolveProject(userId: string, projectId: string) {
  const projects = await getProjects(userId);
  return projects.find((p) => p.project_id === projectId) ?? null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!await resolveProject(session.user.id, id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { watch_path } = await req.json() as { watch_path: string };
  if (!watch_path?.trim()) {
    return NextResponse.json({ error: 'watch_path is required' }, { status: 400 });
  }

  await setWatchPath(session.user.id, id, watch_path.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!await resolveProject(session.user.id, id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await setWatchPath(session.user.id, id, null);
  return NextResponse.json({ ok: true });
}
