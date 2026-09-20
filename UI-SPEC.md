# Viking Aries UI Specification

## Locked visual direction

Viking Aries uses a restrained enterprise application design inspired by the architecture of the user's Hercules apps while keeping Viking Aries' own three-pane builder layout.

### Core palette and surfaces
- Full-height dark navy navigation sidebar.
- Light gray application canvas.
- White work panels with thin cool-gray borders.
- Blue used for selection, active state, primary actions, and links.
- Green reserved primarily for healthy/connected states.
- Minimal shadows.
- Small, restrained corner radii rather than pill-heavy styling.

### Desktop layout
1. Left navigation sidebar.
2. Center AI build/chat workspace.
3. Right live preview pane.

### Project selection
Projects are not permanently listed in the sidebar.
A compact project dropdown near the top of the sidebar switches projects and workspaces.
The dropdown supports Personal and Contractor workspaces.

### Sidebar navigation
The sidebar is project-neutral. App-specific modules live inside Features.

BUILD:
- AI Builder
- Features
- Users & Access
- Files & Media
- Integrations

DATA & LOGIC:
- Database
- Backend
- Automations

TEST & RELEASE:
- Tests & Diagnostics
- Versions
- Deployments
- Domains

PROJECT:
- Secrets
- Settings

The right-side preview pane is the visual editor/viewer, so there is no separate Visual Editor navigation item.

Files & Media is the shared project library for screenshots, mockups, logos, documents, exports, and durable external references.

Secrets are masked by default. Viking Aries will retain owner-controlled encrypted copies so a saved secret can be revealed later even when the destination provider is write-only. Plaintext secret values must not be stored in browser localStorage or routinely exposed to the AI conversation layer.

### Center workspace
- Current project title + active status.
- Project-scoped chat tabs across the top.
- Shared project context visualization when relevant.
- AI conversation as the dominant work surface.
- Composer fixed/sticky at the bottom of the workspace.

### Preview pane
- Docked to the right on desktop.
- Can be hidden completely.
- Can expand to use the application workspace.
- Device presets: Desktop, Tablet, Mobile.
- Mobile layout opens preview as a dedicated pane instead of squeezing it beside chat.

### External helper tools
Project integrations can include:
- GitHub
- Cloudflare
- Convex
- Google Drive
- Gmail
- Supabase when a specific project actually uses it
- other project-specific APIs/providers

Convex is the preferred backend for Viking Aries and for future migrations where changing the existing backend is appropriate.

### Responsive behavior
Desktop preserves three-pane layout.
Tablet may collapse preview.
Mobile uses one primary pane at a time and keeps chat/build actions usable on the road.
