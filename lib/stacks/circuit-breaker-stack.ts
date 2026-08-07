import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

export class CircuitBreakerStack extends cdk.Stack {
  public readonly latencyAlarm: cloudwatch.Alarm;
  public readonly abortFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // cloudwatch metric alarm
    const latencyMetric = new cloudwatch.Metric({
      namespace: 'ADRSE/Metrics',
      metricName: 'SyntheticP99Latency',
      period: cdk.Duration.seconds(10),
      statistic: 'Average',
    });

    this.latencyAlarm = new cloudwatch.Alarm(this, 'AdrseLatencyCircuitBreakerAlarm', {
      metric: latencyMetric,
      threshold: 200,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'ADRSE Safety Switch: Triggers when p99 latency breaches 200ms SLA threshold.',
    });

    // aborting function 
    this.abortFunction = new nodejs.NodejsFunction(this, 'AdrseAbortHookFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../functions/circuit-breaker/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      description: 'ADRSE Safety Hook: Intercepts SLA breach alarms and halts FIS experiments.',
    });

    // stoping the experiments
    this.abortFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['fis:StopExperiment', 'fis:ListExperiments', 'fis:GetExperiment'],
        resources: ['*'],
      })
    );

    // listen to cloudwatch alarm state 
    const alarmRule = new events.Rule(this, 'AdrseAlarmStateChangeRule', {
      description: 'Route CloudWatch Alarm state changes to ADRSE Abort Lambda',
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        detail: {
          alarmName: [this.latencyAlarm.alarmName],
          state: {
            value: ['ALARM'],
          },
        },
      },
    });

    // eventbridge rule
    alarmRule.addTarget(new targets.LambdaFunction(this.abortFunction));
  }
}