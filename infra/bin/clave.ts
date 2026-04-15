#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ClaveStack } from '../lib/clave-stack';

const app = new cdk.App();

new ClaveStack(app, 'ClaveStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Clave — FL Studio version control infrastructure',
});
