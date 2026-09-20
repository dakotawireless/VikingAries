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
