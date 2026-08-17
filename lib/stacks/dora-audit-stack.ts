import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as path from 'path';

export class DoraAuditStack extends cdk.Stack {
    public readonly auditBucket: s3.Bucket;
    public readonly stateMachine: sfn.StateMachine;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        //KMS
        const kmsKey = new kms.Key(this, 'AdrseAuditKey', {
            enableKeyRotation: true,
            description: 'KMS Key for DORA Compliance Audit Evidence',
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        //S3 OBJECT LOCK (7 years/2555 days)
        this.auditBucket = new s3.Bucket(this, 'DoraAuditWormBucket', {
            encryptionKey: kmsKey,
            encryption: s3.BucketEncryption.KMS,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            versioned: true,
            objectLockEnabled: true,
            objectLockDefaultRetention: s3.ObjectLockRetention.compliance(
                cdk.Duration.days(365 * 7)
            ),
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        // report generating function 
        const reportFunction = new nodejs.NodejsFunction(this, 'AdrseReportGeneratorFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.resolve(__dirname, '../functions/report-generator/index.ts'),
            handler: 'handler',
            timeout: cdk.Duration.seconds(30),
            environment: {
                AUDIT_BUCKET_NAME: this.auditBucket.bucketName,
            },
        });

        this.auditBucket.grantReadWrite(reportFunction);
        kmsKey.grantEncryptDecrypt(reportFunction);

        // aws step function state machine 
        const waitPhase = new sfn.Wait(this, 'WaitForRecoveryAndMetrics', {
            time: sfn.WaitTime.duration(cdk.Duration.seconds(30)),
        });

        const generateReportTask = new tasks.LambdaInvoke(this, 'GenerateComplianceCertificate', {
            lambdaFunction: reportFunction,
            outputPath: '$.Payload',
        });

        const definition = waitPhase.next(generateReportTask);

        this.stateMachine = new sfn.StateMachine(this, 'AdrseOrchestratorStateMachine', {
            definitionBody: sfn.DefinitionBody.fromChainable(definition),
            timeout: cdk.Duration.minutes(10),
            comment: 'ADRSE DORA Automated Chaos & Compliance Orchestrator',
        });
    }
}