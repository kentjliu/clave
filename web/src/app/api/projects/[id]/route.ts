import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, setProjectVisibility } from '@/lib/dynamo';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const projects = await getProjects(session.user.id);
  if (!projects.find((p) => p.project_id === id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { visibility } = await req.json() as { visibility: string };
  if (visibility !== 'public' && visibility !== 'private') {
    return NextResponse.json({ error: 'visibility must be "public" or "private"' }, { status: 400 });
  }

  await setProjectVisibility(session.user.id, id, visibility);
  return NextResponse.json({ ok: true });
}
