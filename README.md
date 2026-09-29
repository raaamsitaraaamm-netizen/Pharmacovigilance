# PV Copilot

PV Copilot is a pharmacovigilance case-review prototype for demonstrating an AI-assisted, human-in-the-loop Individual Case Safety Report (ICSR) workflow. The current app is a **local demo**, not a production SaaS and not for regulatory use.

## Current product slice

- Two synthetic demo workspaces with separate browser-local stores.
- Multi-channel report inbox with text search and status/seriousness filters.
- Server-side extraction endpoint with strict request validation and bounded input size.
- Deterministic rule-based extractor behind a mock Amazon Bedrock provider boundary. It makes **no AWS calls** and requires no credentials.
- Evidence-linked review of patient, reporter, suspect drug, reaction, seriousness, confidence, and validity criteria.
- Manual MedDRA candidate selection using an illustrative, unlicensed mock dictionary.
- Human approval gate and simplified E2B(R3)-flavoured XML export.

## Demo limitations

This build has no sign-in, server-side tenant authorization, shared database, durable audit trail, billing, or real Bedrock inference. Workspace separation is a browser UI demonstration only; browser storage is not a security boundary. Do not enter real patient, health, or other sensitive data. Demo workspaces use localStorage and remain on the current browser profile until cleared.

MedDRA names/codes are illustrative placeholders. The XML is simplified and has not been validated against the official ICH schema. This software does not meet validated-system, GxP, HIPAA, GDPR, or other regulatory/compliance requirements and must not be used for case processing or submissions.

## Run locally

Use Node.js 20 LTS (Next.js 14.2.5 requires Node.js 18.17 or newer).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The interface uses seeded synthetic cases. New reports are sent to `POST /api/extract`; the route returns the deterministic Bedrock mock result.

```bash
npm run typecheck
npm run build
npm start
```

`npm run lint` runs the Next.js lint command. No test runner is configured yet.

## Inference boundary

`src/lib/llm/bedrockClient.ts` is the provider seam currently used by the API. `BedrockMockLlmClient` delegates to the deterministic rule extractor and labels provenance as `amazon.nova-lite-v1:0 (mock)`. It does not instantiate an AWS SDK client or contact Amazon Bedrock. `PV_INFERENCE_PROVIDER`, `AWS_REGION`, and `BEDROCK_MODEL_ID` in `.env.example` document the intended future configuration; they are not consumed by the mock.

The eventual Bedrock implementation must stay server-side, use IAM task/instance roles rather than browser credentials, use an approved model and region, redact application logs, enforce request/token/time limits, handle throttling and provider errors, and be assessed for data retention and contractual requirements before processing any sensitive data.

## Architecture

| Area | Location | Current responsibility |
|---|---|---|
| Domain types and extraction schema | `src/types/pvCase.ts` | PV case model, confidence, seriousness, extraction Zod schema |
| Mock extractor | `src/lib/llm/llmClient.ts` | Offline, deterministic heuristic extraction |
| Bedrock provider seam | `src/lib/llm/bedrockClient.ts` | Mock implementation of the planned Bedrock boundary |
| Orchestration | `src/lib/pvAiPipeline.ts` | Extraction, schema validation, mock MedDRA coding, scoring, validity gate |
| Intake API | `src/app/api/extract/route.ts` | Request validation and server-side pipeline invocation |
| Demo workspace state | `src/lib/demoWorkspace.ts` | Synthetic workspace definitions and browser-local persistence |
| Review UI | `src/components/PvReviewWorkspace.tsx` | Inbox, review/edit flow, approval gate, XML download |
| XML mapping | `src/lib/e2bExport.ts` | Simplified XML representation; not submission-ready |

## SaaS launch work still required

These are launch blockers, not optional polish:

1. **Identity and authorization:** integrate a real identity provider (AWS Cognito is the natural AWS default), enforce organization membership and role permissions on every server endpoint, and test cross-tenant access denial. The workspace selector is not authentication.
2. **Tenant data services:** replace localStorage with an encrypted durable database, add tenant-scoped keys/indexes, backup/restore, retention/deletion policy, migrations, and operational recovery. Never trust a tenant ID supplied by the browser.
3. **Auditability:** persist append-only, attributable review events for extraction, field changes, coding overrides, decisions, and exports. Define clock, retention, access, and tamper-evidence controls.
4. **Privacy and security:** threat model, security review, secrets management, encryption/key policy, least privilege, rate limits, abuse protection, dependency scanning, incident response, and log redaction. Keep real PHI out until the applicable legal agreements and controls are in place.
5. **Regulatory validation:** obtain licensed MedDRA/WHODrug data as applicable, validate coding and the full ICH E2B(R3) schema, define SOPs and human review controls, and complete required computerized-system validation and jurisdiction-specific regulatory assessment.
6. **Production inference:** implement and evaluate the real Bedrock adapter, model/region configuration, prompt/version control, safety testing, failure handling, cost limits, and vendor/data-processing review.
7. **Commercial operations:** onboarding, organization/user administration, support, subscription/billing, service monitoring, disaster recovery, terms/privacy notices, and a deployment pipeline with separate environments.

For a HIPAA-targeted service, obtain AWS's applicable BAA and complete the required technical, administrative, and contractual safeguards before any PHI is processed. This repository does not establish HIPAA compliance.

## Production target (not configured)

A reasonable AWS direction is a containerized Next.js service on ECS/Fargate behind an ALB/WAF, Cognito for identity, a tenant-enforcing server-side data layer (DynamoDB or PostgreSQL selected after access-pattern review), S3 for controlled source-document storage, Bedrock through task roles, and CloudWatch/CloudTrail for operational/security telemetry. Infrastructure-as-code, VPC/network controls, backups, alarms, CI/CD, and environment-specific secrets are not included yet.
