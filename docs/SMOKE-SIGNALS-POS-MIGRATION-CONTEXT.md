# Smoke Signals POS Migration Context

## Migration target

- GitHub repository: `dakotawireless/Smoke-Signals-POS---New`
- Migration branch: `migration/remove-hercules`
- Verified imported baseline commit: `d62120d7215817f216d11c9b4379c7cde8e6cd09`
- New Convex deployment: `benevolent-bulldog-176`
- New Convex URL: `https://benevolent-bulldog-176.convex.cloud`
- Matching Cloudflare migration project: created, exact Worker/project identifier and staging URL still need to be registered in Viking Aries.

## Protected live production

- Current live Hercules POS: `https://smoke-signals-pos-224583.onhercules.app`
- Current live Convex deployment: `moonlit-mallard-698`

Do not repoint, reset, overwrite, or migrate the live Hercules/Convex production stack until staging validation and final data reconciliation are complete.

## Completed migration work

- Exact uploaded source archive imported into GitHub after SHA-256 verification.
- Untouched baseline preserved on `main`.
- Hercules Vite runtime removed on the migration branch.
- Hercules auth/OIDC wrapper and dead sign-in scaffolding removed.
- Standard Convex React provider installed.
- Existing POS business logic preserved.
- Frozen pnpm install passes.
- Convex TypeScript check passes.
- Production Vite build passes.
- GitHub Actions `CONVEX_DEPLOY_KEY` configured.
- Schema/functions deployed successfully to `benevolent-bulldog-176`.
- Migration backend diagnostics passed.

## Current migration backend state

Immediately after deployment, diagnostics returned:

- Products: 0
- Customers: 0
- Transactions: 0
- Recovery batches: none
- Backend URL: `https://benevolent-bulldog-176.convex.cloud`

This is intentional. Production data has not yet been copied into the migration backend.

## Functionality to preserve

The migration must preserve existing Smoke Signals POS behavior, including:

- Sale/cart flow
- Customer selection and DOB/age verification
- Employee PIN/time-clock access
- Discounts and split payments
- Barcode scanning
- Products, inventory, stock movements, quick picks
- Customers and loyalty points
- Transactions and line-item snapshots
- Payments/tenders
- Returns/voids
- Shared POS settings
- Recovery Diagnostics
- Production Diagnostics
- Valor VP550 / Valor Connect Cloud integration
- Printed receipt behavior and formatting

Timekeeper is a separate application and must not be modified as part of this migration.

## Next migration stages

1. Register the exact Cloudflare migration Worker/project name and staging URL in Viking Aries.
2. Configure required migration-only environment variables/secrets in the new Convex/Cloudflare stack.
3. Copy production data from `moonlit-mallard-698` into `benevolent-bulldog-176` without changing production.
4. Reconcile record counts and critical data integrity.
5. Deploy the migrated frontend to Cloudflare staging.
6. Test register, inventory, customers, payments, returns, diagnostics, printing, and Valor flows.
7. Perform final delta/reconciliation immediately before cutover.
8. Cut over only after explicit approval.
