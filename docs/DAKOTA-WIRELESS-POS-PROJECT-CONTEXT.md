# Dakota Wireless POS Project Context

This file is the durable Viking Aries project context for the Dakota Wireless POS migration. It contains architecture and migration facts only. It must never contain plaintext credential values.

## Project identity

- Project: Dakota Wireless POS
- VA project ID: `dw-pos`
- Repository: `dakotawireless/Dakota-Wireless-POS---New`
- Default branch: `main`
- Current source baseline: Hercules export uploaded and imported September 20, 2026
- Legacy production URL during migration: `https://dakota-wireless-pos-301249.onhercules.app/`

## Backend

- Provider: Convex
- Existing deployment: `sleek-bear-647`
- Convex URL: `https://sleek-bear-647.convex.cloud`
- Convex HTTP site: `https://sleek-bear-647.convex.site`

The existing Convex deployment and its production data must be preserved. Do not create a replacement database as part of the frontend migration unless Erik explicitly requests that change.

## System role

Dakota Wireless POS is the authoritative backend for the Dakota Wireless website integrations, including:

- online-order quotes and creation
- order status / fulfillment
- customer portal summary and profile
- customer payments and AutoPay
- pricing
- planned live inventory / IMEI reservation flows
- weekly commission data consumed by Timekeeper

The website and POS must be treated as a coordinated system during migration.

## Preserve during migration

Do not rewrite or replace working business logic merely to move hosting.

Preserve:

- Convex schema and production data
- Authorize.Net integration
- Valor terminal integration
- EasyPost integration
- Zoho integration
- payroll / commission API contracts
- online-order and customer-portal API contracts
- current transaction, inventory, billing, wireless, internet, and customer workflows

Provider-managed secret values must remain secret. Unknown values are recorded as existing/unknown rather than guessed, rotated, or exposed.

## Hercules-specific items to remove

The imported source still contains Hercules-specific runtime dependencies that must be replaced before final cutover:

- `@usehercules/auth`
- `@usehercules/sdk`
- `@usehercules/vite`
- `@usehercules/eslint-plugin`
- Hercules OIDC environment variables / Convex auth configuration
- Hercules email SDK calls
- Hercules CDN asset URLs
- hard-coded `onhercules.app` payment/application links
- Hercules metadata in `index.html`

## Durable Files & Media policy

All Dakota Wireless POS uploads, exports, screenshots, prototypes, source archives, and migration reference files must be preserved in the durable project collection:

- Root: `/Viking Aries/Dakota Wireless POS/Files & Media`
- Source exports: `/Viking Aries/Dakota Wireless POS/Files & Media/Source Exports`
- Historical prototypes: `/Viking Aries/Dakota Wireless POS/Files & Media/Historical Prototypes`

The September 20, 2026 POS source export is archived as:

- `dwposviking-2026-09-20.gz`

Fifty earlier Dakota Wireless POS prototype/reference uploads have been consolidated into the Historical Prototypes folder.

Do not rely on a chat attachment, temporary working directory, browser-only upload, or localStorage copy as the only copy of a Dakota Wireless POS project file. Before a POS upload is treated as part of the project record, preserve or register it in the durable Files & Media collection. When Erik asks to find or reference a prior POS upload, check this collection first.

## Final Hercules cutover rule

The September 20 import is a working migration baseline, not the final cutover snapshot.

Immediately before Dakota Wireless POS is disconnected from Hercules:

1. Export the **fresh current POS source** from Hercules.
2. Archive that fresh export in the durable `Source Exports` folder with its cutover date.
3. Compare it with the migration branch/current GitHub source so no Hercules-side changes are lost.
4. Import/reconcile the fresh source.
5. Re-run build and end-to-end integration tests.
6. Only then disconnect/cut over from Hercules.

This fresh-export step is mandatory unless Erik explicitly changes the migration plan.

## Migration sequence

1. Import the current source into GitHub. **Completed September 20, 2026.**
2. Register the project and existing Convex deployment in Viking Aries. **Completed September 20, 2026.**
3. Replace Hercules-only runtime/auth/email/asset dependencies without changing POS business logic.
4. Create and configure the Dakota Wireless POS Cloudflare deployment.
5. Configure Cloudflare build variables/secrets to use the existing Convex deployment.
6. Validate POS login, sales, inventory, customers, billing, payments, wireless, internet, online orders, customer portal APIs, Timekeeper commission sync, and third-party integrations.
7. Move the Dakota Wireless website after the POS is stable on the new runtime.
8. Cut over production only after end-to-end testing passes.

## Safety backups

Before the September 20 source import, the POS repository state was preserved on:

- `pre-va-migration-2026-09-20`

Before registering the POS in the Viking Aries runtime, the VA repository state was preserved on:

- `pre-dw-pos-registration-2026-09-20`

## Migration progress — September 20, 2026

The current GitHub migration copy has now completed these Hercules-detachment steps:

- Hercules Vite and ESLint plugins removed from build configuration and root dependency importer.
- Hercules page metadata replaced with Dakota Wireless POS metadata.
- Public application/payment links centralized behind `DAKOTA_WIRELESS_POS_PUBLIC_URL`, while the existing Hercules hostname remains the temporary fallback.
- All POS email call sites now route through `convex/lib/emailSender.ts`; Hercules SDK remains only as the temporary transport inside that adapter.
- Frontend brand assets are centralized behind `src/lib/brand-assets.ts` and environment-configurable URLs.
- Invoice email logo is configurable with `DAKOTA_WIRELESS_EMAIL_LOGO_URL`.

Current cutover blockers are authentication, permanent email transport, permanent non-Hercules brand assets, Cloudflare POS deployment/configuration, end-to-end verification, and the mandatory fresh Hercules export/reconciliation immediately before disconnect.

The detailed live ledger is also stored in the POS repository at `MIGRATION-STATUS.md`.

## Hosting target

The target frontend host is Cloudflare Workers, consistent with the current Viking Aries migration architecture.

A Cloudflare Worker name or production URL is intentionally not recorded yet. Do not invent one. Register it after the Hercules-specific runtime dependencies have been removed and a real deployment exists.
