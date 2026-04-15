import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';

const BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

export class ClaveStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 ────────────────────────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, 'SnapshotsBucket', {
      bucketName: `clave-snapshots-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── DynamoDB ──────────────────────────────────────────────────────────────
    const projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: 'clave-projects',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'project_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

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

    summarizerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        'arn:aws:bedrock:*::foundation-model/*',
        'arn:aws:bedrock:*:*:inference-profile/*',
      ],
    }));

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(summarizerFn),
      { suffix: '.flp' },
    );

    // ── Lambda: retention ─────────────────────────────────────────────────────
    const retentionFn = new lambdaNodejs.NodejsFunction(this, 'Retention', {
      functionName: 'clave-retention',
      entry: path.join(__dirname, '../lambda/retention/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        PROJECTS_TABLE:  projectsTable.tableName,
        SNAPSHOTS_TABLE: snapshotsTable.tableName,
        BUCKET:          bucket.bucketName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    projectsTable.grantReadData(retentionFn);
    snapshotsTable.grantReadWriteData(retentionFn);
    bucket.grantDelete(retentionFn);

    // Run every night at 03:00 UTC.
    new events.Rule(this, 'RetentionSchedule', {
      schedule: events.Schedule.cron({ hour: '3', minute: '0' }),
      targets: [new targets.LambdaFunction(retentionFn)],
    });

    // =========================================================================
    // Web infrastructure
    // =========================================================================

    // ── ECR ───────────────────────────────────────────────────────────────────
    const ecrRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: 'clave-web',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10, description: 'Keep last 10 images' }],
    });

    // ── GitHub Actions: OIDC + deploy role ────────────────────────────────────
    const githubOidc = new iam.OpenIdConnectProvider(this, 'GitHubOIDC', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'clave-github-deploy',
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': 'repo:kentjliu/clave:*',
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    ecrRepo.grantPullPush(deployRole);

    // ── VPC ───────────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    // ── ECS Cluster ───────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'clave',
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ── Cognito ───────────────────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'clave-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    userPool.addDomain('CognitoDomain', {
      cognitoDomain: { domainPrefix: `clave-${this.account}` },
    });

    // ── NEXTAUTH_SECRET ───────────────────────────────────────────────────────
    const nextAuthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
      secretName: 'clave/nextauth-secret',
      generateSecretString: { passwordLength: 32, excludePunctuation: true },
    });

    // ── Fargate task definition ───────────────────────────────────────────────
    // imageTag is injected by GitHub Actions: `cdk deploy -c imageTag=<git-sha>`
    // Without it (first local deploy): use a public placeholder so no ECR image
    // is needed, and set desiredCount=0 so no tasks are launched.
    const imageTag = this.node.tryGetContext('imageTag') as string | undefined;

    const webTaskDef = new ecs.FargateTaskDefinition(this, 'WebTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    const webImage = imageTag
      ? ecs.ContainerImage.fromEcrRepository(ecrRepo, imageTag)
      : ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20-alpine');

    const webContainer = webTaskDef.addContainer('web', {
      containerName: 'web',
      image: webImage,
      // Inline placeholder server — only used when no imageTag is provided.
      command: imageTag ? undefined : [
        'node', '-e',
        'require("http").createServer((q,r)=>{' +
          'r.writeHead(q.url==="/api/health"?200:404);r.end("ok")' +
        '}).listen(3000)',
      ],
      portMappings: [{ containerPort: 3000 }],
      environment: {
        NODE_ENV: 'production',
        DYNAMODB_PROJECTS_TABLE: projectsTable.tableName,
        DYNAMODB_SNAPSHOTS_TABLE: snapshotsTable.tableName,
        S3_BUCKET: bucket.bucketName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_ISSUER:
          `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
        AWS_REGION_NAME: this.region,
      },
      secrets: {
        NEXTAUTH_SECRET: ecs.Secret.fromSecretsManager(nextAuthSecret),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'clave-web',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
    });

    // ── ALB ───────────────────────────────────────────────────────────────────
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const httpListener = alb.addListener('HttpListener', { port: 80, open: true });

    // ── ECS Fargate service ───────────────────────────────────────────────────
    // desiredCount=0 until GitHub Actions pushes the first real image.
    const webService = new ecs.FargateService(this, 'WebService', {
      cluster,
      serviceName: 'clave-web',
      taskDefinition: webTaskDef,
      desiredCount: imageTag ? 1 : 0,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { rollback: true },
    });

    httpListener.addTargets('WebTargets', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [webService],
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Only the ALB may reach ECS tasks on port 3000.
    webService.connections.allowFrom(alb.connections, ec2.Port.tcp(3000));

    // ── CloudFront ────────────────────────────────────────────────────────────
    const albOrigin = new origins.LoadBalancerV2Origin(alb, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: 'Clave web UI',
      defaultBehavior: {
        origin: albOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      additionalBehaviors: {
        '/_next/static/*': {
          origin: albOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ── Cognito User Pool Client ───────────────────────────────────────────────
    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'clave-web',
      generateSecret: true,
      authFlows: { userSrp: true, userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://${distribution.distributionDomainName}/api/auth/callback/cognito`,
          'http://localhost:3000/api/auth/callback/cognito',
        ],
        logoutUrls: [
          `https://${distribution.distributionDomainName}`,
          'http://localhost:3000',
        ],
      },
    });

    // Store the generated Cognito client secret in Secrets Manager so ECS can
    // inject it at runtime without it appearing in plaintext in task definitions.
    const cognitoClientSecret = new secretsmanager.Secret(this, 'CognitoClientSecret', {
      secretName: 'clave/cognito-client-secret',
      secretStringValue: userPoolClient.userPoolClientSecret,
    });

    // Wire tokens that depend on CloudFront + Cognito client.
    webContainer.addEnvironment(
      'NEXTAUTH_URL',
      `https://${distribution.distributionDomainName}`,
    );
    webContainer.addEnvironment(
      'NEXT_PUBLIC_COGNITO_CLIENT_ID',
      userPoolClient.userPoolClientId,
    );
    webContainer.addSecret(
      'COGNITO_CLIENT_SECRET',
      ecs.Secret.fromSecretsManager(cognitoClientSecret),
    );

    // ── IAM grants ────────────────────────────────────────────────────────────
    projectsTable.grantReadWriteData(webTaskDef.taskRole);
    snapshotsTable.grantReadWriteData(webTaskDef.taskRole);
    bucket.grantReadWrite(webTaskDef.taskRole);
    nextAuthSecret.grantRead(webTaskDef.taskRole);
    cognitoClientSecret.grantRead(webTaskDef.taskRole);
    webTaskDef.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'ProjectsTableName', { value: projectsTable.tableName });
    new cdk.CfnOutput(this, 'SnapshotsTableName', { value: snapshotsTable.tableName });
    new cdk.CfnOutput(this, 'BedrockModelId', { value: BEDROCK_MODEL_ID });
    new cdk.CfnOutput(this, 'EcrRepoUri', { value: ecrRepo.repositoryUri });
    new cdk.CfnOutput(this, 'GitHubDeployRoleArn', { value: deployRole.roleArn });
    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `clave-${this.account}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
