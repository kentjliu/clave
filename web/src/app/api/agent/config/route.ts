import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentToken } from '@/lib/agent-auth';

export async function GET(req: NextRequest) {
  const identity = await verifyAgentToken(req);
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION_NAME,
    projects_table: process.env.DYNAMODB_PROJECTS_TABLE,
    snapshots_table: process.env.DYNAMODB_SNAPSHOTS_TABLE,
    user_id: identity.userId,
  });
}
