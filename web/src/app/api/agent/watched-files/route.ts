import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken } from '@/lib/agent-auth';
import { getWatchedProjects } from '@/lib/dynamo';

export async function GET(req: NextRequest) {
  const identity = await verifyAgentToken(req);
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projects = await getWatchedProjects(identity.userId);

  return NextResponse.json(
    projects.map((p) => ({
      project_id: p.project_id,
      name: p.name,
      watch_path: p.watch_path,
    })),
  );
}
