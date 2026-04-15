import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export class ClaveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3: snapshot storage ──────────────────────────────────────────────────
    // Content-addressed: {user_id}/{project_id}/{sha256}.flp
    // RETAIN on destroy — never delete user snapshots on stack teardown.
    const bucket = new s3.Bucket(this, 'SnapshotsBucket', {
      bucketName: `clave-snapshots-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: projects ────────────────────────────────────────────────────
    // PK: user_id  SK: project_id
    // Scoped by user from day one for future multi-tenancy.
    const projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: 'clave-projects',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'project_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB: snapshots ───────────────────────────────────────────────────
    // PK: project_id  SK: timestamp (ISO, sortable)
    // GSI on hash: allows Lambda to look up a record from the S3 key alone.
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

    // ── Secrets Manager: Anthropic API key ────────────────────────────────────
    // The secret value is a placeholder — set it manually after deploy:
    //   aws secretsmanager put-secret-value \
    //     --secret-id clave/anthropic-api-key \
    //     --secret-string "sk-ant-..."
    const anthropicSecret = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: 'clave/anthropic-api-key',
      description: 'Anthropic API key used by the clave summarizer Lambda',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ placeholder: true }),
        generateStringKey: '_unused',
      },
    });

    // ── Lambda: summarizer ────────────────────────────────────────────────────
    // NodejsFunction bundles the TypeScript handler + @anthropic-ai/sdk with
    // esbuild at synth time. AWS SDK modules are excluded (available in runtime).
    const summarizerFn = new lambdaNodejs.NodejsFunction(this, 'Summarizer', {
      functionName: 'clave-summarizer',
      entry: path.join(__dirname, '../lambda/summarizer/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SNAPSHOTS_TABLE: snapshotsTable.tableName,
        ANTHROPIC_SECRET_ARN: anthropicSecret.secretArn,
      },
      bundling: {
        // Bundle @anthropic-ai/sdk; exclude AWS SDK (provided by runtime).
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
        nodeModules: ['@anthropic-ai/sdk'],
      },
    });

    snapshotsTable.grantReadWriteData(summarizerFn);
    bucket.grantRead(summarizerFn);
    anthropicSecret.grantRead(summarizerFn);

    // S3 PutObject on any .flp file triggers the summarizer.
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(summarizerFn),
      { suffix: '.flp' },
    );

    // ── Stack outputs (use these to populate ~/.clave/config.json) ────────────
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
    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS region',
    });
    new cdk.CfnOutput(this, 'AnthropicSecretName', {
      value: anthropicSecret.secretName,
      description: 'Set your Anthropic API key here after deploy',
    });
  }
}
