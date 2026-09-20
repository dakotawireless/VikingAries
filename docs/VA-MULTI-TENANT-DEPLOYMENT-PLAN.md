# Viking Aries Multi-Tenant Deployment Plan

## Goal

Make Viking Aries deployable for other business owners as a secure, multi-tenant SaaS application while preserving strict isolation between businesses.

## Recommended architecture

### Organizations and tenants

Core entities:

- User
- Organization
- OrganizationMember
- Project
- Conversation
- Task
- Integration
- UsageEvent
- AuditEvent

Every business-owned record should include an `organizationId`, along with project and creator references where applicable.

### Server-side persistence

Move organizations, projects, chats, messages, tasks, handoffs, integration metadata, usage records, and audit history to server-side storage. Browser storage should be limited to temporary UI state, such as layout preferences or unsent drafts.

### Authentication and authorization

Support owner signup/login, invitations, session management, organization switching, and roles such as Owner, Admin, Member, and Viewer. Every API request must verify authentication, organization membership, and project/action permissions.

### Organization-scoped integrations

Each business should connect its own GitHub, Gmail, Google Drive, Convex, Cloudflare, and other provider accounts. Store OAuth tokens and credentials only in a secure vault or encrypted server-side store. The browser receives provider metadata and status only, never secrets.

### Cross-project handoffs

Allow handoffs only between projects in the same organization unless explicit cross-organization sharing is later added. The handoff must preserve source and destination organization/project IDs, task links, transfer type, initiator, timestamp, status, audit history, and a concise context packet. Destination permissions, repositories, secrets, deployments, and provider connections must be used after transfer.

### Usage accounting

API usage should be aggregated per organization and billing period, with breakdowns by project, user, provider, model, requests, tokens, and estimated cost where available. One customer’s usage must never appear in another customer’s counter.

## Deployment models

### Hosted SaaS (recommended first)

One Viking Aries deployment serves multiple isolated organizations. This centralizes updates, authentication, monitoring, and billing.

### Self-hosted deployment

Each business receives its own Cloudflare deployment and configuration. This offers stronger deployment isolation but increases operational and update complexity.

A hybrid model can support hosted customers first and self-hosting later.

## Cloudflare-oriented components

- Cloudflare Workers for API and server-side logic
- D1 for relational multi-tenant data
- Durable Objects for coordination, counters, or live operations
- R2 for uploaded files and attachments
- KV for non-critical caching
- Cloudflare Access or another authentication provider
- Workers Secrets for server-side credentials
- Queues for asynchronous provider operations and syncs

Existing bindings and deployment configuration must be audited before selecting the final implementation.

## Suggested rollout

### Phase 1: Foundation

- Define organization and membership schema.
- Add organization-aware authentication.
- Add authorization middleware.
- Add server-side project and chat persistence.
- Add tenant-isolation tests.

### Phase 2: Integrations

- Move integrations from browser metadata to organization-scoped records.
- Add secure OAuth/token storage.
- Add provider connect/disconnect flows.
- Add project capability restrictions.

### Phase 3: Collaboration

- Add persistent tasks.
- Implement move and copy handoffs.
- Add audit trails and context packets.
- Add conflict and failure handling.

### Phase 4: Usage and billing

- Record server-side API usage.
- Add organization budgets and billing periods.
- Add usage dashboards.
- Add subscription or invoicing integration if needed.

### Phase 5: Customer onboarding

- Business signup flow
- Organization setup wizard
- Team invitations
- Integration connection
- First project creation
- Usage budget configuration
- Billing plan
- Support and administration tools

## Security rule

Every server-side operation must follow:

```text
authenticated user
→ organization membership
→ project membership/access
→ requested action
```

This prevents cross-business access to chats, repositories, integrations, secrets, usage, and deployments.

## Follow-up

Revisit this plan before beginning the organization/authentication/data-model work. The requested reminder target is approximately five days after it was saved.
