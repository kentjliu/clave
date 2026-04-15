import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Construct } from 'constructs';
import * as path from 'path';

// Claude 3.5 Haiku on Bedrock — fast and cheap, same model family.
// Requires model access to be enabled in the Bedrock console for this region.
const BEDROCK_MODEL_ID = 'anthropic.claude-3-5-haiku-20241022-v1:0';

export class ClaveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3: snapshot storage ──────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, 'SnapshotsBucket', {
      bucketName: `clave-snapshots-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: projects ────────────────────────────────────────────────────
    // PK: user_id  SK: project_id — scoped by user for future multi-tenancy.
    const projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: 'clave-projects',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'project_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: snapshots ───────────────────────────────────────────────────
    // PK: project_id  SK: timestamp  GSI: hash → lets Lambda look up by S3 key.
    const snapshotsTable = new dynamodb.Table(this, 'SnapshotsTable', {
      tableName: 'clave-snapshots',
      partitionKey: { name: 'project_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    snapshotsTable.addGlobalSecondaryIndex({
      indexName: 'hash-index',
      partitionKey: { name: 'hash', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Lambda: summarizer ────────────────────────────────────────────────────
    // All AWS SDK clients (including Bedrock) are available in the runtime —
    // no bundling needed, no API key, IAM handles auth.
    const summarizerFn = new lambdaNodejs.NodejsFunction(this, 'Summarizer', {
      functionName: 'clave-summarizer',
      entry: path.join(__dirname, '../lambda/summarizer/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SNAPSHOTS_TABLE: snapshotsTable.tableName,
        BEDROCK_MODEL_ID,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    snapshotsTable.grantReadWriteData(summarizerFn);
    bucket.grantRead(summarizerFn);

    // Allow Lambda to call the specific Bedrock model.
    summarizerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/${BEDROCK_MODEL_ID}`,
      ],
    }));

    // S3 PutObject on any .flp file triggers the summarizer.
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(summarizerFn),
      { suffix: '.flp' },
    );

    // ── Stack outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket for .flp snapshots',
    });
    new cdk.CfnOutput(this, 'ProjectsTableName', {
      value: projectsTable.tableName,
      description: 'DynamoDB table for projects',
    });
    new cdk.CfnOutput(this, 'SnapshotsTableName', {
      value: snapshotsTable.tableName,
      description: 'DynamoDB table for snapshots',
    });
    new cdk.CfnOutput(this, 'BedrockModelId', {
      value: BEDROCK_MODEL_ID,
      description: 'Bedrock model used for summarization',
    });
  }
}
