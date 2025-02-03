import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as chatbot from 'aws-cdk-lib/aws-chatbot';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import { Construct } from 'constructs';
import * as path from 'path';

interface SimpleCloudwatchSyntheticsStackProps extends cdk.StackProps {
  slackWorkspaceId: string;
  slackChannelId: string;
}

export class SimpleCloudwatchSyntheticsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SimpleCloudwatchSyntheticsStackProps) {
    super(scope, id, props);

    // ログ保存用のS3バケットを作成
    const loggingBucket = new s3.Bucket(this, 'CanaryLoggingBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Canary用のIAMロールを作成
    const role = new iam.Role(this, 'CanaryRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudwatch:PutMetricData',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          's3:PutObject',
          'secretsmanager:GetSecretValue',
        ],
        resources: ['*'],
      })
    );

    // Canaryを作成
    const canary = new synthetics.Canary(this, 'WebsiteCanary', {
      schedule: synthetics.Schedule.rate(Duration.minutes(5)),
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset(path.join(__dirname, 'canary-script')),
        handler: 'index.handler',
      }),
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_9_1,
      timeout: Duration.minutes(2),
      artifactsBucketLocation: { bucket: loggingBucket },
      role: role,
    });

    // SNSトピックを作成
    const topic = new sns.Topic(this, 'CanaryAlarmTopic', {
      displayName: 'Canary Alarm Notifications',
    });

    // AWS Chatbotの設定
    const slackChannel = new chatbot.SlackChannelConfiguration(this, 'SlackChannel', {
      slackChannelConfigurationName: 'canary-monitoring-alerts',
      slackWorkspaceId: props.slackWorkspaceId,
      slackChannelId: props.slackChannelId,
      notificationTopics: [topic],
    });

    // CloudWatchアラームを作成
    const alarm = new cloudwatch.Alarm(this, 'CanaryAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'CloudWatchSynthetics',
        metricName: 'SuccessPercent',
        dimensionsMap: {
          CanaryName: canary.canaryName,
          StepName: 'clickSignOut'
        },
        period: Duration.minutes(5),
        statistic: 'Average'
      }),
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: 'Canary verifyLogout step failed',
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // アラームにSNSアクションを追加
    alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
  }
}
