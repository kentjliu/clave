import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION_NAME });
export const dynamo = DynamoDBDocumentClient.from(client);

export const PROJECTS_TABLE  = process.env.DYNAMODB_PROJECTS_TABLE!;
export const SNAPSHOTS_TABLE = process.env.DYNAMODB_SNAPSHOTS_TABLE!;
export const USERS_TABLE     = process.env.DYNAMODB_USERS_TABLE!;

// ── Username validation ───────────────────────────────────────────────────────

const USERNAME_RE = /^[a-z0-9_-]{3,20}$/;
const RESERVED = new Set([
  'admin', 'api', 'account', 'explore', 'projects', 'users',
  'me', 'settings', 'login', 'logout', 'signup', 'support',
]);

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 3–20 characters: lowercase letters, numbers, _ or -.';
  }
  if (RESERVED.has(username)) {
    return 'That username is reserved.';
  }
  return null;
}

// ── User profile types + functions ────────────────────────────────────────────

export interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  created_at: string;
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const res = await dynamo.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { user_id: userId },
  }));
  return (res.Item as UserProfile) ?? null;
}

export async function getProfileByUsername(username: string): Promise<UserProfile | null> {
  const res = await dynamo.send(new QueryCommand({
    TableName: USERS_TABLE,
    IndexName: 'username-index',
    KeyConditionExpression: 'username = :u',
    ExpressionAttributeValues: { ':u': username },
    Limit: 1,
  }));
  return (res.Items?.[0] as UserProfile) ?? null;
}

export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const existing = await getProfileByUsername(username);
  if (!existing) return false;
  return existing.user_id !== excludeUserId;
}

export async function upsertProfile(profile: {
  user_id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
}): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      ...profile,
      created_at: new Date().toISOString(),
    },
    // Preserve created_at if record already exists.
    ConditionExpression: 'attribute_not_exists(user_id)',
  }));
}

export async function updateProfile(userId: string, updates: {
  username?: string;
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}): Promise<void> {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue;
    sets.push(`#${k} = :${k}`);
    names[`#${k}`] = k;
    values[`:${k}`] = v;
  }
  if (!sets.length) return;

  await dynamo.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { user_id: userId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

export async function listProfiles(limit = 50): Promise<UserProfile[]> {
  const res = await dynamo.send(new ScanCommand({
    TableName: USERS_TABLE,
    Limit: limit,
  }));
  return (res.Items ?? []) as UserProfile[];
}

export async function searchProfiles(query: string): Promise<UserProfile[]> {
  // DynamoDB doesn't support full-text search — scan and filter client-side.
  // Fine at this scale; replace with OpenSearch when the user base grows.
  const all = await listProfiles(1000);
  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.username.includes(q) ||
      p.display_name.toLowerCase().includes(q),
  );
}

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
