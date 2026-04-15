import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION       = process.env.AWS_REGION_NAME ?? 'us-east-1';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const BUCKET       = process.env.S3_BUCKET!;
const PROJECTS_TABLE  = process.env.DYNAMODB_PROJECTS_TABLE!;
const SNAPSHOTS_TABLE = process.env.DYNAMODB_SNAPSHOTS_TABLE!;

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const s3      = new S3Client({ region: REGION });
const dynamo  = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ── GET: storage usage ────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  // Fetch all projects for the user.
  const projectsRes = await dynamo.send(new QueryCommand({
    TableName: PROJECTS_TABLE,
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  const projects = (projectsRes.Items ?? []) as { project_id: string; name: string }[];

  // Sum file_size across all snapshots for all projects.
  let totalBytes = 0;
  const breakdown: { project_id: string; name: string; bytes: number }[] = [];

  for (const project of projects) {
    let projectBytes = 0;
    let lastKey: Record<string, unknown> | undefined;

    do {
      const res = await dynamo.send(new QueryCommand({
        TableName: SNAPSHOTS_TABLE,
        KeyConditionExpression: 'project_id = :pid',
        ExpressionAttributeValues: { ':pid': project.project_id },
        ProjectionExpression: 'file_size',
        ExclusiveStartKey: lastKey,
      }));
      for (const item of res.Items ?? []) {
        projectBytes += (item.file_size as number) ?? 0;
      }
      lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    totalBytes += projectBytes;
    breakdown.push({ project_id: project.project_id, name: project.name, bytes: projectBytes });
  }

  return NextResponse.json({ total_bytes: totalBytes, breakdown });
}

// ── DELETE: delete account ────────────────────────────────────────────────────

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  // 1. Delete all S3 objects under the user prefix.
  let continuationToken: string | undefined;
  do {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `${userId}/`,
      ContinuationToken: continuationToken,
    }));
    if (list.Contents?.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) },
      }));
    }
    continuationToken = list.NextContinuationToken;
  } while (continuationToken);

  // 2. Delete all DynamoDB snapshot + project records.
  const projectsRes = await dynamo.send(new QueryCommand({
    TableName: PROJECTS_TABLE,
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));

  for (const project of (projectsRes.Items ?? []) as { project_id: string }[]) {
    let lastKey: Record<string, unknown> | undefined;
    do {
      const snaps = await dynamo.send(new QueryCommand({
        TableName: SNAPSHOTS_TABLE,
        KeyConditionExpression: 'project_id = :pid',
        ExpressionAttributeValues: { ':pid': project.project_id },
        ProjectionExpression: 'project_id, #ts',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExclusiveStartKey: lastKey,
      }));
      for (const snap of snaps.Items ?? []) {
        await dynamo.send(new DeleteCommand({
          TableName: SNAPSHOTS_TABLE,
          Key: { project_id: snap.project_id, timestamp: snap.timestamp },
        }));
      }
      lastKey = snaps.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    await dynamo.send(new DeleteCommand({
      TableName: PROJECTS_TABLE,
      Key: { user_id: userId, project_id: project.project_id },
    }));
  }

  // 3. Delete the Cognito user.
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: userId,
  }));

  return NextResponse.json({ ok: true });
}
