import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION_NAME });
export const dynamo = DynamoDBDocumentClient.from(client);

export const PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE!;
export const SNAPSHOTS_TABLE = process.env.DYNAMODB_SNAPSHOTS_TABLE!;

export interface ProjectRecord {
  user_id: string;
  project_id: string;
  name: string;
  flp_path: string;
  watch_path?: string;   // absolute local path the agent should watch; absent = not watched
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

export async function createProject(project: {
  user_id: string;
  project_id: string;
  name: string;
  flp_path: string;
  s3_prefix: string;
}): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: PROJECTS_TABLE,
    Item: {
      user_id: project.user_id,
      project_id: project.project_id,
      name: project.name,
      flp_path: project.flp_path,
      s3_prefix: project.s3_prefix,
    },
    ConditionExpression: 'attribute_not_exists(project_id)',
  }));
}

export async function createSnapshot(snapshot: {
  project_id: string;
  timestamp: string;
  user_id: string;
  hash: string;
  file_size: number;
  s3_key: string;
}): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: SNAPSHOTS_TABLE,
    Item: {
      project_id: snapshot.project_id,
      timestamp: snapshot.timestamp,
      user_id: snapshot.user_id,
      hash: snapshot.hash,
      file_size: snapshot.file_size,
      s3_key: snapshot.s3_key,
      metadata: '{}',
      summary_status: 'pending',
    },
    ConditionExpression: 'attribute_not_exists(#ts)',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
  }));
}

export async function setWatchPath(
  userId: string,
  projectId: string,
  watchPath: string | null,
): Promise<void> {
  if (watchPath) {
    await dynamo.send(new UpdateCommand({
      TableName: PROJECTS_TABLE,
      Key: { user_id: userId, project_id: projectId },
      UpdateExpression: 'SET watch_path = :wp',
      ExpressionAttributeValues: { ':wp': watchPath },
    }));
  } else {
    await dynamo.send(new UpdateCommand({
      TableName: PROJECTS_TABLE,
      Key: { user_id: userId, project_id: projectId },
      UpdateExpression: 'REMOVE watch_path',
    }));
  }
}

export async function getWatchedProjects(userId: string): Promise<ProjectRecord[]> {
  const all = await getProjects(userId);
  return all.filter((p) => p.watch_path);
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
