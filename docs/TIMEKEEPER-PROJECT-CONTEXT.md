# Timekeeper Project Context

This file is the durable Viking Aries project context for the Timekeeper application. It contains architecture and migration facts only. It must never contain plaintext credential values.

## Identity

- Project: Timekeeper
- Repository: `dakotawireless/TimeKeeper-App`
- Default branch: `main`
- Production: `https://timekeeper-app.erik-f2c.workers.dev`
- Backend: Convex
- Convex deployment: `aware-caiman-251`
- Convex URL: `https://aware-caiman-251.convex.cloud`
- Hosting: Cloudflare Workers
- Email: Gmail SMTP
- Status: Independent of Hercules

## Production behavior

### Time clock
- employee PIN clock-in/out
- breaks
- decimal-hour display
- employee punch access requires an active registered browser profile
- Owner/Manager PIN can still reach administration to register a browser

### Administration
- Time Records
- Employees
- Employee Notes
- Payroll
- Employee Portal Preview
- Registered Devices

### Payroll / commission
- weekly payroll
- manual commission
- Dakota Wireless POS commission sync
- commission is included in labor-cost totals
- commission sync uses mapped Dakota Wireless POS user IDs
- commission refresh is server-side

### Employee self-service portal
- route: `/employee`
- employee enters email
- Gmail sends a six-digit one-time code
- code lifetime: 10 minutes
- employee session: 7 days
- employee can view own timecards
- Pay Statements area exists as the foundation for paystubs
- admin preview renders the same employee-portal UI

### Gmail
Known environment-variable names:
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

These are the tested working Gmail SMTP configuration. Do not replace Gmail SMTP with Microsoft Graph unless Erik explicitly requests that change.

### Deployment
Cloudflare build uses the Convex deploy key name:
- `CONVEX_DEPLOY_KEY`

Never store the actual key value in this repository.

## Important source checkpoints

- `3fae5961ab6a81e57b6de10d2aa1e85599409d2c` — registered-device enforcement
- `4a786112...` — labor cost includes commission
- `555ec52...` — employee detail avoids commission double-counting
- `25127e00...` — employee portal session tables
- `967fdf98...` — shared Gmail helper
- `fe660f83...` — existing email module uses shared Gmail helper
- `84e415280f662930293d8ed9ee84a3f3104b16eb` — employee portal preview present on main

## Current architectural rule

Timekeeper remains in its own repository and existing Convex deployment.

Viking Aries is the command center. VA should store or link to the Timekeeper facts needed to build, troubleshoot, deploy, and maintain the app without copying the entire Timekeeper source tree into the VA repository.

## Migration guardrails

- Preserve existing Convex data.
- Preserve Gmail SMTP.
- Preserve working PIN behavior.
- Preserve registered-device enforcement.
- Preserve Dakota Wireless POS commission sync unless intentionally changed.
- Verify the current source before replacing a provider or dependency.
- Do not claim a production change is deployed unless deployment evidence or live verification exists.
