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

## Hosting target

The target frontend host is Cloudflare Workers, consistent with the current Viking Aries migration architecture.

A Cloudflare Worker name or production URL is intentionally not recorded yet. Do not invent one. Register it after the Hercules-specific runtime dependencies have been removed and a real deployment exists.
