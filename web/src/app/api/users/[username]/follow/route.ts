import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProfileByUsername, followUser, unfollowUser } from '@/lib/dynamo';

type Params = { params: Promise<{ username: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await params;
  const target = await getProfileByUsername(username);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.user_id === session.user.id) {
    return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
  }

  await followUser(session.user.id, target.user_id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username } = await params;
  const target = await getProfileByUsername(username);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await unfollowUser(session.user.id, target.user_id);
  return NextResponse.json({ ok: true });
}
