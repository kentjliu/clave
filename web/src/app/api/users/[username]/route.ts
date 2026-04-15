import { NextResponse } from 'next/server';
import { getProfileByUsername } from '@/lib/dynamo';

// Public — no auth required. Returns only safe public fields.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user_id:      profile.user_id,
    username:     profile.username,
    display_name: profile.display_name,
    bio:          profile.bio ?? null,
    avatar_url:   profile.avatar_url ?? null,
    created_at:   profile.created_at,
  });
}
