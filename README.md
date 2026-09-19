# Viking Aries

Viking Aries is a personal AI app-building workspace designed to organize, build, connect, preview, and deploy multiple software projects from one place.

Temporary target domain:

- `https://vikingaries.dakotawireless.net`

## Current stack

- React + Vite
- GitHub for source control
- Cloudflare planned for hosting/deployment
- Supabase planned for Viking Aries application data
- Existing migrated apps can continue using Convex

## Current UI foundation

The first real app shell is now implemented with:

- Compact project dropdown rather than a permanent project list
- Personal / Contractor workspace separation
- Project-scoped chat tabs
- Shared project context panel
- Dark navy enterprise-style sidebar
- Light gray center work surface
- Right-side preview pane
- Preview hide / expand / dock controls
- Desktop / Tablet / Mobile preview modes
- Helper-app toolbar for GitHub, Cloudflare, Supabase, and Convex
- Sidebar scaffolding for:
  - Chats
  - Architecture
  - Integrations
  - Backend
  - Deployments
  - Logs
  - Secrets
  - Settings
  - Activity
  - Automations

See `UI-SPEC.md` for the locked visual direction.

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

1. Deploy through Cloudflare at `vikingaries.dakotawireless.net`
2. Connect Supabase
3. Create the project registry
4. Persist chat threads
5. Add secure secrets/settings scaffolding
6. Add GitHub-aware project actions
7. Add Convex/Supabase backend adapters
8. Make Viking Aries capable of editing its own repository through staging/preview deployments
