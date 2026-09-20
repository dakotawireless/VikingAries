# Viking Aries Architecture

Viking Aries (VA) is Erik's private command center for building, migrating, documenting, and operating multiple applications.

## Core stack

- GitHub: source code and durable code/file references
- Cloudflare: frontend hosting, workers, preview/staging/production deployment
- Convex: preferred backend/database for Viking Aries and new migrations unless an existing application has a compelling reason to remain elsewhere
- Viking Aries: project registry, project context, build workspace, files/media catalog, integrations, diagnostics, versions, automation definitions, and secure-vault metadata

Existing applications should keep working backends during migration unless there is a specific reason to replace them.

## Durable-data rule

Important project information must not exist only in a chat transcript.

Every important item should either:

1. live directly in Viking Aries, or
2. have a durable retrievable pointer stored in Viking Aries.

Examples:

- GitHub repository, file path, branch, or commit
- Convex deployment identifier and URL
- Cloudflare deployment URL / domain
- Google Drive file ID or retrievable link
- production/staging URL
- project asset reference
- diagnostic result / checkpoint
- automation definition

## Universal sidebar

The left sidebar stays project-neutral.

### BUILD
- AI Builder
- Features
- Users & Access
- Files & Media
- Integrations

### DATA & LOGIC
- Database
- Backend
- Automations

### TEST & RELEASE
- Tests & Diagnostics
- Versions
- Deployments
- Domains

### PROJECT
- Secrets
- Settings

App-specific concepts such as Payroll, Inventory, Customers, Time Records, or Orders belong inside **Features**, not in the universal sidebar.

## Preview pane

The right preview pane is the visual editing/viewing surface. There is no separate Visual Editor sidebar item.

## Files & Media

Files & Media is the shared working library between Erik and the AI builder.

It should support:

- screenshots
- mockups
- logos
- reference images
- PDFs
- exports
- documents
- durable repository file references
- Google Drive references
- other retrievable project assets

Binary assets may ultimately live in VA storage, GitHub, Google Drive, or another durable provider. VA records where they live.

## Integrations

Integrations is the project-level registry for connected services including, as needed:

- GitHub
- Convex
- Cloudflare
- Google Drive
- Gmail
- Supabase
- payment systems
- project-to-project APIs
- other external providers

A project does not need to use every supported integration.

## Secure secret vault

Some providers allow a secret to be written but never read back. VA therefore needs its own secure encrypted vault.

Requirements:

- encrypted at rest
- plaintext secret values never stored in browser localStorage
- secret values masked by default
- owner can reveal a saved value with an eye/show control
- owner can copy, replace, rotate, or push a secret to another provider
- vault stores project/environment/provider metadata
- AI chat does not automatically receive plaintext secrets
- normal AI context contains only secret name, provider, purpose, and configuration status
- master encryption material must not be stored alongside encrypted ciphertext

The provider copy is a deployment target; the VA vault is the retrievable owner-controlled copy.

## Project migration rule

For Hercules-origin apps:

1. inspect the current source and backend
2. preserve the current data
3. preserve working external integrations
4. remove Hercules runtime/build/auth dependencies
5. move source control and deployment under the independent stack
6. register all architecture and operational context in VA
7. verify production behavior before considering the migration complete

Do not change backends simply for standardization if preserving the existing backend is safer.
