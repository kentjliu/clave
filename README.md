# Clave

Version control for FL Studio projects.

FL Studio's `.flp` files are opaque binaries — you can't diff them, and the built-in history is limited. Clave watches your project file, snapshots it on every save, and uses AI to write a one-sentence summary of what changed. All snapshots are stored in your AWS account and viewable in a web UI.

## How it works

1. **CLI** watches a `.flp` file. On every save, it hashes the file, uploads it to S3, and records metadata (tempo, channels, patterns) in DynamoDB.
2. **Lambda** triggers on the S3 upload and calls Amazon Bedrock (Claude) to generate a summary by comparing the current metadata to the previous version.
3. **Web UI** shows a timeline of snapshots per project, with summaries and a download button for each.

```
FL Studio save
      │
      ▼
 clave watch (Python CLI)
      │  hash + parse metadata
      ▼
 DynamoDB  ──────────────────────▶  Lambda (Bedrock/Claude)
      │                                      │
      │                              writes summary back
      ▼                                      │
    S3 (.flp snapshots) ◀──────────────────── ┘
      │
      ▼
  Web UI (Next.js / CloudFront)
```

## Stack

| Layer | Tech |
|---|---|
| CLI | Python, watchdog, pyflp, boto3 |
| Storage | S3 (snapshots), DynamoDB (metadata) |
| Summarizer | AWS Lambda, Amazon Bedrock (Claude Sonnet 4) |
| Web | Next.js 15, next-auth, ECS Fargate, CloudFront |
| Auth | Amazon Cognito (web OAuth + CLI password flow) |
| Infra | AWS CDK (TypeScript) |
| CI/CD | GitHub Actions (OIDC, no long-lived secrets) |

## Getting started

### Prerequisites

- Python 3.11
- An AWS account with the Clave CDK stack deployed
- FL Studio (any version)

### Install the CLI

```bash
pip install git+https://github.com/kentjliu/clave.git
```

### Log in

```bash
clave login
# prompts for email and password
```

This authenticates with Cognito and stores a refresh token in `~/.clave/config.json`. Your user ID (Cognito sub) is used as the DynamoDB partition key — the same identity the web UI uses.

### Configure the S3 bucket

After deploying the CDK stack, set the bucket name once:

```bash
clave configure --bucket clave-snapshots-<account>-<region>
```

All other resource names (`clave-projects`, `clave-snapshots` tables) are set to the correct defaults automatically.

### Watch a project

```bash
clave watch ~/Music/my-track.flp
```

Clave will snapshot the file on every save. Press `Ctrl+C` to stop.

### View history

```bash
clave log                        # all projects
clave log ~/Music/my-track.flp   # one project
```

Output:

```
my-track  (/Users/kent/Music/my-track.flp)
──────────────────────────────────────────────────────────────────────
  2026-04-14T14:32:10  a3f9c1e2b4d1  1,204 KB  Added bass synth at 128 BPM, 12 channels.
  2026-04-14T13:15:44  8e2b1a9f3c07  1,180 KB  Initial project with 8 patterns at 140 BPM.
```

### Restore a snapshot

```bash
clave restore ~/Music/my-track.flp 2026-04-14T14:32:10
```

Downloads the snapshot from S3 and atomically replaces the local file. Stop `clave watch` first.

### Other commands

```bash
clave projects    # list all tracked projects
clave logout      # revoke tokens and clear credentials
clave configure   # show current config
```

## Web UI

The web UI is deployed at your CloudFront URL (printed by `cdk deploy`). Sign in with the same Cognito account used for the CLI to see all your projects and snapshots.

## Snapshot retention

Clave automatically prunes old snapshots to keep storage costs low:

| Age | Policy |
|---|---|
| < 7 days | Keep all |
| 7–30 days | 1 per hour |
| > 30 days | 1 per day |

The most musically developed snapshot in each window is kept (by file size as a proxy).

## Deploying the infrastructure

```bash
cd infra
npm install
npx cdk bootstrap   # first time only
npx cdk deploy
```

Subsequent deploys happen automatically on push to `main` via GitHub Actions. The pipeline builds the Docker image, pushes to ECR, and updates the ECS service.

## Repository structure

```
clave/          Python CLI source
infra/          AWS CDK stack (TypeScript)
  lambda/       Bedrock summarizer Lambda
web/            Next.js web UI
```
