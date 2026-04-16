import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProjects, getSnapshots, type SnapshotRecord } from '@/lib/dynamo';
import { getAudioUrl } from '@/lib/s3';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  const projects = await getProjects(session.user.id);
  const project = projects.find((p) => p.project_id === projectId);
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const snapshots = await getSnapshots(projectId);

  // Inject presigned audio URLs for done previews.
  const enriched = await Promise.all(
    snapshots.map(async (snap: SnapshotRecord) => {
      if (snap.audio_status === 'done' && snap.audio_s3_key) {
        try {
          const audio_url = await getAudioUrl(snap.audio_s3_key);
          return { ...snap, audio_url };
        } catch {
          return snap;
        }
      }
      return snap;
    }),
  );

  return NextResponse.json(enriched);
}
