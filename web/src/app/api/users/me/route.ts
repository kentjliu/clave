import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getProfile,
  upsertProfile,
  updateProfile,
  isUsernameTaken,
  validateUsername,
} from '@/lib/dynamo';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getProfile(session.user.id);
  return NextResponse.json(profile);   // null = profile not set up yet
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { username, display_name, bio, avatar_url } = await req.json() as {
    username: string;
    display_name: string;
    bio?: string;
    avatar_url?: string;
  };

  // Validate username.
  const usernameError = validateUsername(username);
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 });

  if (!display_name?.trim()) {
    return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
  }

  // Check uniqueness, excluding the current user.
  if (await isUsernameTaken(username, session.user.id)) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  const existing = await getProfile(session.user.id);
  if (!existing) {
    await upsertProfile({
      user_id: session.user.id,
      username,
      display_name: display_name.trim(),
      bio: bio?.trim(),
      avatar_url,
    });
  } else {
    await updateProfile(session.user.id, {
      username,
      display_name: display_name.trim(),
      bio: bio?.trim(),
      avatar_url,
    });
  }

  return NextResponse.json({ ok: true });
}
