import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProjects,
  getCollaborators,
  getProfileByUsername,
  inviteCollaborator,
} from '@/lib/dynamo';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const projects = await getProjects(session.user.id);
  if (!projects.find((p) => p.project_id === projectId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const collaborators = await getCollaborators(projectId);
  return NextResponse.json(collaborators);
}

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const projects = await getProjects(session.user.id);
  const project = projects.find((p) => p.project_id === projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { username } = await req.json() as { username: string };
  if (!username?.trim()) return NextResponse.json({ error: 'username is required' }, { status: 400 });

  const invitee = await getProfileByUsername(username.trim().toLowerCase());
  if (!invitee) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  if (invitee.user_id === session.user.id) {
    return NextResponse.json({ error: 'Cannot invite yourself.' }, { status: 400 });
  }

  try {
    await inviteCollaborator({
      projectId,
      projectOwnerId:  session.user.id,
      projectName:     project.name,
      collaboratorId:  invitee.user_id,
      displayName:     invitee.display_name,
      username:        invitee.username,
      avatarUrl:       invitee.avatar_url,
    });
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return NextResponse.json({ error: 'This user has already been invited.' }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
