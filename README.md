# Viking Aries

Viking Aries is a personal AI app-building workspace designed to organize, build, connect, preview, and deploy multiple software projects from one place.

Temporary target domain:

- `https://vikingaries.dakotawireless.net`

## Current stack

- React + Vite
- GitHub for source control
- Cloudflare for hosting/deployment
- Convex is the preferred Viking Aries application backend/database
- Existing migrated apps keep their working backend unless there is a specific reason to replace it

## Current UI foundation

The app shell currently includes:

- Compact project dropdown rather than a permanent project list
- Personal / Contractor workspace separation
- Project-scoped AI Builder chats
- Durable project context supplied to the AI builder
- Dark navy project-neutral sidebar
- Right-side live preview pane
- Preview hide / expand / dock controls
- Desktop / Tablet / Mobile preview modes
- Timekeeper live-production preview
- Project-neutral builder workspaces:
  - AI Builder
  - Features
  - Users & Access
  - Files & Media
  - Integrations
  - Database
  - Backend
  - Automations
  - Tests & Diagnostics
  - Versions
  - Deployments
  - Domains
  - Secrets
  - Settings
- Timekeeper project metadata pre-populated from the completed migration
- Durable architecture/context files under `docs/`

See `UI-SPEC.md` for the visual direction and `docs/VIKING-ARIES-ARCHITECTURE.md` for the current architecture rules.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Next phases

1. Create Viking Aries' own Convex backend/deployment
2. Replace temporary browser-local project metadata with Convex persistence
3. Implement the encrypted VA secret vault and masked/reveal workflow
4. Persist project chat threads in VA
5. Add real Files & Media storage plus durable GitHub/Drive references
6. Add GitHub-aware project actions
7. Add Cloudflare and Convex deployment/status adapters
8. Add provider-backed integration management
9. Make Viking Aries capable of editing its own repository through staging/preview deployments
10. Migrate remaining Hercules-origin apps into the same independent GitHub + Cloudflare + Convex + VA pattern where appropriate


## Owner security and GitHub runtime tools

Viking Aries now has an owner-authenticated runtime layer for tool-backed provider actions.

Runtime secrets are **not** committed to GitHub or stored in browser localStorage. During bootstrap they are supplied to the Cloudflare Worker as server-side secrets.

Required runtime secrets:

- `OWNER_ACCESS_CODE` — the owner login passphrase/code used by the Viking Aries login screen.
- `OWNER_SESSION_SECRET` — a long random secret used only to sign the secure HttpOnly owner session cookie.
- `GITHUB_TOKEN` — a GitHub credential with access only to the repositories Viking Aries is expected to manage.

Security behavior:

- Owner sessions are signed server-side and stored in an HttpOnly, Secure, SameSite=Strict cookie.
- Sessions expire after 12 hours.
- GitHub tools are exposed to the AI only when owner authentication is configured, the owner is actively authenticated, a GitHub credential exists, and the selected project has a valid mapped repository.
- The GitHub tool layer is locked to the repository mapped to the currently selected project; the AI does not choose an arbitrary repository.
- Current GitHub runtime tools support directory listing, file reads, and create/replace file commits.
- Provider secrets are never sent as normal chat context.

The Integrations screen can verify the configured GitHub credential and shows whether GitHub tools are currently available to Viking Aries.

The longer-term vault remains the target for durable encrypted provider credential storage and rotation. Cloudflare server-side secrets are the secure bootstrap mechanism until that vault is online.

## Bounded agent execution

Chat requests use a request-local budget of 44 outbound operations, including
provider fetches, usage/audit persistence, and cached Secrets Store lookups. This
leaves headroom under the Workers Free plan's 50-subrequest limit. Redirects are
rejected in chat so hidden redirect hops cannot bypass accounting. Failed attempts
count too. Each message permits at most 8 tool rounds and 20 tool executions.
Before starting a tool, the runtime reserves capacity for up to four provider
requests, two audit operations, and a final model response plus its usage record.

When a budget is reached, unstarted tools receive explicit deferred results and
the model is asked for a progress summary with tools disabled. The ordinary chat
response includes the summary, completed action receipts, usage, and
`executionStatus: "paused"`. Send **continue** in the same chat to start another
bounded invocation using the conversation summary and verified action history.
There is no automatic retry or replay of writes, and no background continuation
is implied. The existing UI and job response contract are preserved.

The checked-in configuration does not identify the account's Workers plan. Do not
raise the platform limit on an unverified plan. Once Workers Paid is confirmed,
`limits: { "subrequests": 10000 }` may be set in `wrangler.jsonc` (the current paid
default); a higher value is unnecessary for this bounded runtime. If a dashboard
limit is lower than 50, align it with the free-compatible 50 baseline. Keep the
application budget in place even on Paid. A plan/limit change is not required for
this fix. See https://developers.cloudflare.com/workers/platform/limits/ and
https://developers.cloudflare.com/workers/wrangler/configuration/#limits.

Run `npm test` and `npm run build` before deploying. Budget tests cover large tool
batches, writes and receipts, repeated model rounds, storage failures, secret
caching, hard limits, and concurrent request isolation.
