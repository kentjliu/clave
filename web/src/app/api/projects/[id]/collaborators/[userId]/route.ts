import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProjects,
  getCollaboratorRecord,
  updateCollaboratorStatus,
  removeCollaborator,
} from '@/lib/dynamo';

type Params = { params: Promise<{ id: string; userId: string }> };

// Accept invite (invitee only).
export async function PATCH(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, userId } = await params;
  if (userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const record = await getCollaboratorRecord(projectId, userId);
  if (!record) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  if (record.status === 'accepted') return NextResponse.json({ ok: true });

  await updateCollaboratorStatus(projectId, userId, 'accepted');
  return NextResponse.json({ ok: true });
}

// Remove collaborator — owner removes anyone, collaborator removes themselves.
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, userId } = await params;

  // Verify caller is owner or the collaborator themselves.
  const ownedProjects = await getProjects(session.user.id);
  const isOwner = ownedProjects.some((p) => p.project_id === projectId);
  const isSelf  = userId === session.user.id;

  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await removeCollaborator(projectId, userId);
  return NextResponse.json({ ok: true });
}
