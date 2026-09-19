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
Primary:
- Chats
- Architecture
- Integrations
- Backend
- Deployments
- Logs
- Secrets
- Settings

Secondary:
- Activity
- Automations

Secrets must be designed so secret values are not shown to the AI conversation layer.

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
Top utility bar provides quick access to:
- GitHub
- Cloudflare
- Supabase
- Convex

### Responsive behavior
Desktop preserves three-pane layout.
Tablet may collapse preview.
Mobile uses one primary pane at a time and keeps chat/build actions usable on the road.
