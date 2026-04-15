import { NextResponse } from 'next/server';
import { listProfiles, searchProfiles } from '@/lib/dynamo';

// Public — no auth required.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const profiles = q ? await searchProfiles(q) : await listProfiles(50);

  return NextResponse.json(
    profiles.map((p) => ({
      user_id:      p.user_id,
      username:     p.username,
      display_name: p.display_name,
      bio:          p.bio ?? null,
      avatar_url:   p.avatar_url ?? null,
    })),
  );
}
