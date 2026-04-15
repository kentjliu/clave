import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const PROJECTS_TABLE  = process.env.PROJECTS_TABLE!;
const SNAPSHOTS_TABLE = process.env.SNAPSHOTS_TABLE!;
const BUCKET          = process.env.BUCKET!;

const KEEP_ALL_DAYS    = 7;
const KEEP_HOURLY_DAYS = 30;

// ── Timestamp parsing ─────────────────────────────────────────────────────────
// Stored as "2026-04-14T14-32-10" (dashes) or ISO 8601 — handle both.

function parseTs(ts: string): Date {
  const normalised = ts.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
  return new Date(normalised);
}

// ── Per-project retention ─────────────────────────────────────────────────────

async function applyRetention(projectId: string): Promise<void> {
  // Fetch all snapshots for this project, oldest-first.
  const snapshots: Record<string, string>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await dynamo.send(new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'project_id = :pid',
      ExpressionAttributeValues: { ':pid': projectId },
      ScanIndexForward: true,
      ExclusiveStartKey: lastKey,
    }));
    snapshots.push(...((res.Items ?? []) as Record<string, string>[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  if (snapshots.length <= 1) return;

  const now = Date.now();
  const cutoffAll    = now - KEEP_ALL_DAYS    * 86_400_000;
  const cutoffHourly = now - KEEP_HOURLY_DAYS * 86_400_000;

  // Build keep set — iterating ascending means later entries overwrite earlier
  // ones, so only the latest snapshot per bucket is kept.
  const keepIds  = new Set<string>();
  const hourly: Record<string, string> = {};
  const daily:  Record<string, string> = {};

  for (const row of snapshots) {
    const ts  = parseTs(row.timestamp).getTime();
    const rid = `${row.project_id}#${row.timestamp}`;

    if (ts >= cutoffAll) {
      keepIds.add(rid);
    } else if (ts >= cutoffHourly) {
      hourly[row.timestamp.slice(0, 13)] = rid;   // "2026-04-14T14"
    } else {
      daily[row.timestamp.slice(0, 10)] = rid;    // "2026-04-14"
    }
  }

  for (const rid of Object.values(hourly)) keepIds.add(rid);
  for (const rid of Object.values(daily))  keepIds.add(rid);

  // Delete anything not in the keep set.
  for (const row of snapshots) {
    const rid = `${row.project_id}#${row.timestamp}`;
    if (keepIds.has(rid)) continue;

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.s3_key }));
      await dynamo.send(new DeleteCommand({
        TableName: SNAPSHOTS_TABLE,
        Key: { project_id: projectId, timestamp: row.timestamp },
      }));
      console.log(`Pruned ${row.s3_key}`);
    } catch (err) {
      console.warn(`Could not prune ${row.s3_key}:`, err);
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (): Promise<void> => {
  // Scan the projects table to get every project_id across all users.
  const projectIds = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await dynamo.send(new ScanCommand({
      TableName: PROJECTS_TABLE,
      ProjectionExpression: 'project_id',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of res.Items ?? []) {
      if (item.project_id) projectIds.add(item.project_id as string);
    }
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  console.log(`Running retention for ${projectIds.size} project(s).`);

  // Process projects concurrently in batches of 10.
  const ids = [...projectIds];
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(applyRetention));
  }

  console.log('Retention complete.');
};
