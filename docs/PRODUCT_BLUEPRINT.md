# Viking Aries Product Blueprint

> Living, version-controlled source of truth for the Viking Aries product.

**Status:** Prototype / productization  
**Established:** 2026-09-21  
**Guiding principle:** *Aries helps you build your software. It doesn't own your software.*

## Product Vision

Viking Aries is evolving from a personal AI app-building environment into a deployable subscription product designed to let people—including users with little or no programming knowledge—build, import, migrate, maintain, troubleshoot, preview, and deploy real applications and websites using natural language.

The near-term acceptance test is a stable prototype that can give a completely separate user an isolated workspace, allow that user to connect their own services, migrate at least one real existing application, make changes, preview them, and deploy without needing to understand the underlying developer tooling.

## Product Pillars

1. **BUILD** — Create applications and websites through natural-language instructions.
2. **IMPORT** — Bring in projects the customer already owns.
3. **MIGRATE** — Move functioning applications away from other app builders safely.
4. **OPERATE** — Maintain, troubleshoot, change, and deploy those applications afterward.

## Non-Programmer-First UX

Aries should hide unnecessary technical complexity. Users should not need to understand Git branches, environment variables, deployment keys, npm, TypeScript, API endpoints, or infrastructure terminology to accomplish normal work.

Errors should be translated into plain English with safe remediation actions. Technical details should remain available through expandable/advanced views.

## Customer Ownership & Portability

Customers own their source code, applications, designs, files, business information, ideas, and customer-specific data.

Aries should avoid platform lock-in. Customers should be able to export their projects, source, relevant files, and an understandable description of their infrastructure. Customer-owned GitHub repositories, hosting deployments, databases, and related infrastructure should remain usable if the customer stops subscribing to Viking Aries.

## Workspace & Tenant Isolation

Commercial Aries must use strict ownership boundaries:

User → Workspace → Project → Chats / Files / Integrations / Secrets / Deployments / AI Usage

Nothing new should assume a single owner/user. Customer A's private project information must never become available to Customer B through search, AI context, files, chats, integrations, APIs, or normal application behavior.

## Privacy & Intellectual Property

Private customer project content must not be used as another customer's project knowledge or context.

Viking Aries should not claim ownership of customer projects or use private customer project information to develop competing products.

Private project content should not be used to train Viking Aries by default. AI providers and routing configurations must be chosen so the privacy promises made to customers remain accurate across the full processing chain.

Privacy language must acknowledge operational necessities such as encrypted backups, disaster recovery, security logging, and short-lived processing/cache data. Such data exists only as necessary to provide, secure, back up, and operate that customer's service, subject to documented retention/deletion rules.

## Secrets & Credentials

Secrets are encrypted at rest and masked by default.

The UI provides explicit **View** and **Copy** controls to authorized users. Sensitive operations are permission-controlled and auditable. Audit records must never contain the secret value.

Backend integrations should use secrets directly without unnecessarily placing raw credentials into AI model context.

## AI Architecture

Convex AI Gateway is the preferred primary routing layer, while preserving direct provider/OpenAI support as a fallback and/or BYOK option where appropriate.

Desired capabilities:

- task-aware model routing;
- automatic escalation for difficult problems;
- economy models for routine work;
- strong reasoning/coding models when justified;
- provider fallback;
- project-aware targeted context;
- context caching/reuse;
- cost-aware model selection;
- customer-controlled limits;
- transparent model-selection reasoning.

## Radical Cost Transparency

Viking Aries should avoid opaque proprietary AI-credit systems.

Each completed Aries task may subtly show information such as:

> GPT-5.x Mini · 84,921 tokens · $0.07

The usage dashboard should show:

- Today;
- This week;
- This month;
- estimated monthly spend;
- spend by project;
- spend by task/chat;
- model used;
- input/output/cached tokens;
- model-routing decisions;
- economy-model tasks;
- advanced-model escalations;
- cache utilization;
- estimated optimization savings.

The goal is that customers always understand where their AI money went.

## Commercial Hypothesis

The motivating hypothesis is that heavy users of existing AI app builders may pay dramatically more through proprietary credit systems than the underlying AI/infrastructure workload would cost when efficiently routed and transparently billed.

Early Viking Aries usage has appeared dramatically cheaper than the creator's prior app-builder experience, but this must be validated through controlled measurements and real case studies before making public savings claims.

Potential commercial structures include:

- a low fixed platform subscription with customer-owned infrastructure and customer-paid AI Gateway/provider usage;
- higher tiers that bundle an AI allowance;
- BYOK/provider billing for advanced or heavy users;
- business/team tiers later.

Pricing is not finalized.

## Migration Engine

Migration is a core product feature rather than a simple Git repository importer.

Potential source adapters include:

- Hercules;
- Bolt;
- Lovable;
- Replit;
- v0;
- Base44;
- GitHub;
- local ZIP/source export;
- Other.

A migration should inspect and account for:

- source code;
- database and live records;
- authentication/users;
- files/storage;
- secrets/environment configuration;
- domains;
- scheduled jobs;
- email;
- payments;
- external APIs;
- hosting/infrastructure.

### Safe Migration Workflow

Extract → Inventory → Map → Replace platform-specific dependencies → Import data → Configure customer-owned infrastructure → Build → Test → Compare/validate → Stage → Production cutover

The existing production application remains untouched until the migrated version has been validated.

### Migration UX

A non-programmer should be able to upload/connect an application and have Aries identify its stack and dependencies automatically, explain what it found in plain English, request only the external account connections that are actually required, and handle the technical configuration.

Database/live-state migration should be first-class and include understandable validation such as table/record/index/function counts and discrepancy detection.

Migration lessons should become generalized platform migration rules and adapters—not reuse of a customer's proprietary code or business logic.

## Migration Analyzer

Consider a free/read-only Migration Analyzer as a customer acquisition path.

Without modifying the source application, Aries could report:

- detected technology/dependencies;
- what can migrate automatically;
- what needs attention;
- required destination infrastructure;
- migration complexity;
- estimated ongoing AI/infrastructure costs.

The user can then choose **Start Migration**.

## Prototype Acceptance Test

The near-term prototype should prioritize:

- reliable natural-language chat and project context;
- durable files/media;
- reliable GitHub, Cloudflare, and Convex integrations;
- AI Gateway/model routing;
- AI usage/cost tracking;
- safe build/deploy workflow;
- plain-English errors;
- project import/migration;
- clean and simple UI;
- proper authentication and workspace isolation;
- a new user seeing none of the creator's private data;
- a real second user migrating one real application, modifying it, previewing it, and deploying it without requiring programming knowledge.

## Development Discipline

Until the prototype passes the first-new-user acceptance test, avoid feature creep unless a feature directly helps achieve that test.

## Continuous Documentation Rule

This blueprint is a living document. Significant product decisions should be reflected here or in supporting documents under `docs/` and committed to GitHub so the product vision evolves alongside the codebase.

Planned supporting documents:

- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/AI_ROUTING.md`
- `docs/MIGRATION_ENGINE.md`
- `docs/PRIVACY_SECURITY.md`
- `docs/ROADMAP.md`
