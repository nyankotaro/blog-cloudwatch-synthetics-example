#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SimpleCloudwatchSyntheticsStack } from '../lib/simple-cloudwatch-synthetics-stack';

const app = new cdk.App();
new SimpleCloudwatchSyntheticsStack(app, 'SimpleCloudwatchSyntheticsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT, // デフォルトのAWSアカウント
    region: process.env.CDK_DEFAULT_REGION,   // デフォルトのリージョン
  },
  slackWorkspaceId: 'T03SX1NSF', // Slackワークスペースのid
  slackChannelId: 'C03KL7Q6A6L',   // Slackチャンネルのid
});