# Smoke Signals POS — Viking Aries Migration Context

## Purpose

This document is the durable Viking Aries context for migrating Smoke Signals POS away from Hercules without disrupting the live store.

## Protected production

- Live POS: `https://smoke-signals-pos-224583.onhercules.app/`
- Live/legacy Convex deployment: `moonlit-mallard-698`
- Do not change, repoint, reset, migrate, or cut over production until migration staging passes end-to-end validation.
- Timekeeper is a separate application and must not be modified as part of this migration.

## Migration targets

- GitHub repository: `dakotawireless/Smoke-Signals-POS---New`
- Untouched imported baseline: `main`
- Verified baseline commit: `d62120d7215817f216d11c9b4379c7cde8e6cd09`
- Active migration branch: `migration/remove-hercules`
- Draft migration PR: `#1`
- New Convex deployment: `benevolent-bulldog-176`
- New Convex URL: `https://benevolent-bulldog-176.convex.cloud`
- Convex dashboard: `https://dashboard.convex.dev/t/erik-2df00/smoke-signals-pos-new/benevolent-bulldog-176`
- Cloudflare Worker target registered in VA: `smoke-signals-pos---new`
- Cloudflare staging URL: not yet verified

## Verified migration state

The exact uploaded source archive was SHA-256 verified before import into GitHub.

The migration branch has removed the Hercules Vite/auth/OIDC runtime while preserving POS business logic.

The cleaned migration branch passed:

- frozen `pnpm` install
- Convex TypeScript validation
- production Vite build

A first Convex deployment workflow failed safely before deployment because the deploy key was unavailable at that time.

A later workflow run succeeded. It:

- found `CONVEX_DEPLOY_KEY`
- deployed schema/functions to `benevolent-bulldog-176`
- created the migration schema/indexes
- ran `diagnostics:getStatus` successfully

The migration backend is intentionally empty before data migration:

- products: 0
- customers: 0
- transactions: 0
- recovery batches: none

## Required integrations

### GitHub

Repository mapping is active:

- repository: `dakotawireless/Smoke-Signals-POS---New`
- default migration branch: `migration/remove-hercules`

### Convex

Migration deployment:

- `benevolent-bulldog-176`
- `https://benevolent-bulldog-176.convex.cloud`

`CONVEX_DEPLOY_KEY` is stored as a GitHub Actions secret. Never copy the value into Viking Aries project metadata or chat.

### Cloudflare

A matching migration project exists. Viking Aries currently registers the expected Worker target as:

- `smoke-signals-pos---new`

Verify the Worker with the shared Cloudflare integration before recording a staging URL or triggering a migration build.

### Valor Connect Cloud / VP550

The new Convex migration deployment must receive these environment variables before live card-terminal testing:

- `VALOR_API_BASE_URL`
- `VALOR_APP_ID`
- `VALOR_APP_KEY`
- `VALOR_EPI`
- `VALOR_CHANNEL_ID`

Never place the values in GitHub source, Viking Aries project metadata, or chat.

## Core shared Convex tables

- `users`
- `posSettings`
- `cardPaymentAttempts`
- `customers`
- `pointsEvents`
- `products`
- `stockMovements`
- `transactions`
- `returns`
- `recoveryBatches`

## Cutover rule

Do not merge/cut over merely because the app builds. Before production cutover, verify at minimum:

1. migration data copy/reconciliation
2. product/inventory counts and stock history
3. customers and loyalty data
4. transaction/return history
5. register sale flow
6. barcode/product search
7. cash, outside-card, split-payment behavior
8. Valor VP550 live test
9. void/return behavior
10. Recovery Tool / Production Diagnostics
11. multi-device shared-data behavior
12. Cloudflare staging stability

Only after explicit approval should the live Hercules POS be retired or production routing changed.
