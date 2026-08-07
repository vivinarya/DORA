# Automated DORA Resiliency & Safety Engine (ADRSE)

An automated, event-driven Chaos Engineering framework designed to enforce and validate ICT operational resilience for financial entities under EU DORA (Digital Operational Resilience Act) regulations (Articles 24 & 25) and ISO 22301 standards.

ADRSE programmatically injects controlled fault scenarios against AWS infrastructure, evaluates recovery SLAs against target RTO/RPO objectives, enforces sub-second circuit-breaking guardrails, and exports immutable WORM audit evidence for compliance reviewers.

---

## Architectural Overview

The framework orchestrates fault injection experiments using a decoupled, event-driven pattern:

1. Target Workload: Multi-AZ Amazon EC2 Auto Scaling Group backed by Amazon RDS PostgreSQL Multi-AZ deployment.
2. Safety Circuit Breaker: Real-time CloudWatch Alarms monitoring synthetic p99 latency and error rates. Alarms emit state changes to Amazon EventBridge, invoking an AWS Lambda abort hook to execute `fis:StopExperiment` in sub-second timelines.
3. Orchestration State Machine: AWS Step Functions manages the lifecycle of fault injection, running pre-flight health checks, executing AWS FIS templates, and coordinating post-experiment metric collection.
4. Compliance & Immutability Engine: Post-mortem metrics and digitally signed experiment logs are ingested and written directly to Amazon S3 configured with Object Lock in Compliance Mode (WORM storage).

---

## Technical Stack

* Infrastructure as Code: AWS CDK (TypeScript)
* Fault Injection Engine: AWS Fault Injection Service (FIS)
* Compute & Database: Amazon EC2, AWS Auto Scaling, Amazon RDS PostgreSQL (Multi-AZ)
* Orchestration & Messaging: AWS Step Functions, Amazon EventBridge
* Serverless & Observability: AWS Lambda, Amazon CloudWatch Alarms, Metric Filters
* Compliance & Security: Amazon S3 (Object Lock Compliance Mode), AWS KMS

---

## Repository Structure

```text
adrse-core/
├── bin/
│   └── adrse-app.ts                 # CDK application entry point
├── lib/
│   ├── stacks/                      # Infrastructure Stacks
│   │   ├── target-workload-stack.ts  # Multi-AZ VPC, EC2 ASG, and RDS PostgreSQL
│   │   ├── circuit-breaker-stack.ts # CloudWatch Alarms, EventBridge, & Abort Hook
│   │   ├── chaos-engine-stack.ts    # AWS FIS Experiment Templates
│   │   └── dora-audit-stack.ts      # Step Functions State Machine & S3 WORM Bucket
│   ├── constructs/                  # Reusable Custom CDK Constructs
│   │   ├── worm-bucket.ts           # S3 Object Lock Compliance Mode Construct
│   │   └── fis-guardrail.ts         # FIS Stop Condition Construct
│   └── functions/                   # Runtime Lambda Handlers
│       ├── circuit-breaker/
│       │   └── index.ts             # Sub-second experiment abort handler
│       └── report-generator/
│           └── index.ts             # Audit certificate compiler
├── test/                            # Infrastructure Unit Tests
└── README.md