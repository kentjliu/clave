import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION_NAME });
export const dynamo = DynamoDBDocumentClient.from(client);

export const PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE!;
export const SNAPSHOTS_TABLE = process.env.DYNAMODB_SNAPSHOTS_TABLE!;

export interface ProjectRecord {
  user_id: string;
  project_id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface SnapshotRecord {
  project_id: string;
  timestamp: string;
  hash: string;
  file_size: number;
  metadata: string;
  summary?: string;
  summary_status?: string;
}

export async function getProjects(userId: string): Promise<ProjectRecord[]> {
  const res = await dynamo.send(new QueryCommand({
    TableName: PROJECTS_TABLE,
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return (res.Items ?? []) as ProjectRecord[];
}

export async function getSnapshots(projectId: string): Promise<SnapshotRecord[]> {
  const items: SnapshotRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await dynamo.send(new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'project_id = :pid',
      ExpressionAttributeValues: { ':pid': projectId },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((res.Items ?? []) as SnapshotRecord[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}
