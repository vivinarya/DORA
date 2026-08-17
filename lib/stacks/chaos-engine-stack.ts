import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as fis from 'aws-cdk-lib/aws-fis';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as rds from 'aws-cdk-lib/aws-rds';

export interface ChaosEngineStackProps extends cdk.StackProps {
    readonly targetDatabase: rds.DatabaseInstance;
    readonly safetyAlarm: cloudwatch.Alarm;
}

export class ChaosEngineStack extends cdk.Stack {
    public readonly rdsFailoverTemplate: fis.CfnExperimentTemplate;

    constructor(scope: Construct, id: string, props: ChaosEngineStackProps) {
        super(scope, id, props);

        //IAM role for fis
        const fisRole = new iam.Role(this, 'AdrseFisExecutionRole', {
            assumedBy: new iam.ServicePrincipal('fis.amazonaws.com'),
            description: 'IAM Role allowing AWS FIS to execute RDS failover and EC2 chaos actions',
        });

        fisRole.addToPolicy(
            new iam.PolicyStatement({
                actions: [
                    'rds:RebootDBInstance',
                    'rds:DescribeDBInstances',
                    'ec2:RebootInstances',
                    'ec2:StopInstances',
                    'ec2:TerminateInstances',
                    'ec2:DescribeInstances',
                ],
                resources: ['*'],
            })
        );

        //FIS TEMPLATE 
        this.rdsFailoverTemplate = new fis.CfnExperimentTemplate(this, 'RdsFailoverExperimentTemplate', {
            description: 'ADRSE DORA Chaos Experiment: Forced RDS PostgreSQL Primary Node Failover',
            roleArn: fisRole.roleArn,
            stopConditions: [
                {
                    source: 'aws:cloudwatch:alarm',
                    value: props.safetyAlarm.alarmArn,
                },
            ],
            targets: {
                'TargetDatabase': {
                    resourceType: 'aws:rds:db',
                    resourceArns: [props.targetDatabase.instanceArn],
                    selectionMode: 'ALL',
                },
            },
            actions: {
                'RebootAndFailover': {
                    actionId: 'aws:rds:reboot-db-instances',
                    parameters: {
                        forceFailover: 'true',
                    },
                    targets: {
                        Instances: 'TargetDatabase',
                    },
                },
            },
            tags: {
                Name: 'ADRSE-DORA-RDS-Failover-Test',
                ComplianceFramework: 'EU-DORA-Art-25',
            },
        });
    }
}

