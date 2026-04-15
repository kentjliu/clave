import { S3Event } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({});

const SNAPSHOTS_TABLE = process.env.SNAPSHOTS_TABLE!;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID!;

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(
  current: Record<string, unknown>,
  previous: Record<string, unknown> | null,
  sizeDelta: number,
): string {
  const prev = previous
    ? JSON.stringify(previous, null, 2)
    : 'None (first snapshot)';
  const curr = JSON.stringify(current, null, 2);
  const sign = sizeDelta >= 0 ? '+' : '';
  return `You are summarizing a save event for an FL Studio music project.

Previous version metadata:
${prev}

Current version metadata:
${curr}

File size change: ${sign}${sizeDelta.toLocaleString()} bytes

Write a single concise sentence (max 20 words) describing what likely changed.
Focus on musical changes: tempo, instruments, patterns, arrangement.
If metadata is sparse, base your summary on file size change.
If this is the first snapshot, describe the initial project state.
Do not speculate beyond what the data shows.`;
}

// ── Bedrock invocation ────────────────────────────────────────────────────────

async function invoke(prompt: string): Promise<string> {
  const response = await bedrock.send(new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    }),
  }));

  const body = JSON.parse(new TextDecoder().decode(response.body));
  return body.content[0].text.trim();
}

// ── Core logic ────────────────────────────────────────────────────────────────

async function processRecord(s3Key: string): Promise<void> {
  // Key format: {user_id}/{project_id}/{hash}.flp
  const parts = s3Key.split('/');
  if (parts.length !== 3 || !parts[2].endsWith('.flp')) {
    console.warn(`Unexpected S3 key format: ${s3Key}`);
    return;
  }

  const projectId = parts[1];
  const hash = parts[2].slice(0, -4);

  // Look up snapshot record via hash GSI.
  const gsiRes = await dynamo.send(new QueryCommand({
    TableName: SNAPSHOTS_TABLE,
    IndexName: 'hash-index',
    KeyConditionExpression: '#h = :h',
    ExpressionAttributeNames: { '#h': 'hash' },
    ExpressionAttributeValues: { ':h': hash },
  }));

  const snapshot = gsiRes.Items?.[0];
  if (!snapshot) {
    console.warn(`No DynamoDB record found for hash ${hash.slice(0, 12)}`);
    return;
  }

  const timestamp: string = snapshot.timestamp;
  const currentMeta: Record<string, unknown> = JSON.parse(snapshot.metadata ?? '{}');
  const fileSize: number = snapshot.file_size ?? 0;

  // Get the snapshot immediately before this one.
  const prevRes = await dynamo.send(new QueryCommand({
    TableName: SNAPSHOTS_TABLE,
    KeyConditionExpression: 'project_id = :pid AND #ts < :ts',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ExpressionAttributeValues: { ':pid': projectId, ':ts': timestamp },
    ScanIndexForward: false,
    Limit: 1,
  }));

  const prevSnapshot = prevRes.Items?.[0] ?? null;
  const prevMeta = prevSnapshot ? JSON.parse(prevSnapshot.metadata ?? '{}') : null;
  const sizeDelta = fileSize - (prevSnapshot?.file_size ?? fileSize);

  let summary: string;
  let status: string;

  try {
    summary = await invoke(buildPrompt(currentMeta, prevMeta, sizeDelta));
    status = 'done';
    console.log(`[${hash.slice(0, 12)}] ${summary}`);
  } catch (err) {
    console.error(`Summary failed for ${hash.slice(0, 12)}:`, err);
    summary = '';
    status = 'failed';
  }

  await dynamo.send(new UpdateCommand({
    TableName: SNAPSHOTS_TABLE,
    Key: { project_id: projectId, timestamp },
    UpdateExpression: 'SET summary = :s, summary_status = :st',
    ExpressionAttributeValues: { ':s': summary, ':st': status },
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event: S3Event): Promise<void> => {
  await Promise.all(
    event.Records.map((record) => {
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      return processRecord(key);
    }),
  );
};
