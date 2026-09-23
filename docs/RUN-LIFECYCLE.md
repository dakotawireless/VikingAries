# Execution lifecycle

All new submissions use `/api/jobs`. A job is persisted before a scheduled action claims it. `/api/chat` accepts only authenticated internal requests for a persisted job and atomically claims each runner once. Duplicate job IDs and user-message IDs return the existing job instead of scheduling another execution.

Wire states remain lowercase for compatibility: `queued`, `running`, `completed`, `failed`, `canceled` (legacy `cancelled` is also recognized), and `timed_out`. Terminal states cannot be overwritten by late success or failure.

The Cloudflare runner checks the durable state every two seconds. Cancellation or an unavailable control endpoint aborts the signal inherited by provider and tool requests. The control request has a five-second timeout. The independent Convex watchdog runs every 30 seconds, expires a missing heartbeat after 60 seconds, and enforces an eight-minute execution deadline below the action host's ten-minute limit. Queued requests expire after 30 minutes. Neither expired runs nor pre-migration queued requests are replayed.

The UI polls durable status and reconciles on focus and reconnect. Historical browser-only jobs without a durable record become interrupted. Stop reports server failures instead of pretending that cancellation succeeded.

## Limits and operations

- A timeout or Stop cannot undo a write already accepted by GitHub or another provider. Inspect action receipts before submitting a follow-up.
- Abort stops further requests and closes in-flight transports. Provider-side billing already incurred, or generation accepted before transport loss, cannot be inferred solely from the local usage counter. Verify provider usage if billing certainty is required.
- An eight-minute task is timed out rather than automatically replayed. Long work must be split into explicit follow-ups; this patch does not introduce automatic checkpoint/resume.
- The live Worker calls `flippant-mandrill-487`, a Convex development deployment. The project's default production deployment is a different backend. Deploy to the configured live backend explicitly; migrating data/backends is separate work.
- Deploy the Convex functions/schema before the Worker. The watchdog is independent of browser polling and action `finally` blocks. Keep both layers on the same protocol.

## Regression coverage

`npm test` covers single claims, duplicate submissions/deliveries, terminal-state races, stale/deadline cleanup, no replay of legacy queued work, active-job listing beyond recent history, provider/tool abort propagation, and usage accounting. `npm run build` validates critical files and builds the Worker and browser assets.
