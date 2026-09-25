# Execution lifecycle

All new submissions use `/api/jobs`. A job is persisted before a scheduled action claims it. `/api/chat` accepts only authenticated internal requests for a persisted job and atomically claims each runner once. Duplicate job IDs and user-message IDs return the existing job instead of scheduling another execution.

A durable job may span multiple bounded execution slices. The Worker still keeps the existing hard per-slice ceilings—4 minutes, 8 agent rounds, 20 tool operations, 44 outbound agent-work requests, and $0.50 estimated AI cost—but normal complex work checkpoints before those ceilings at 6 rounds, 16 tools, a 12-request reserve, or about $0.42 estimated AI cost. A slice checkpoint is not a job failure and does not require the owner to type “continue.”

When a slice checkpoints, Convex persists the checkpoint, verified action receipts, cumulative job cost, and continuation state, then automatically schedules the next slice. The next slice resumes the same job and reuses the same durable task branch. Default job-level guardrails are 6 substantive continuations, $3.00 cumulative estimated AI cost, and 30 minutes elapsed time. Validation-only polling does not consume the substantive continuation count. Those job-level limits can be configured per submission within server caps.

For code-changing work, the selected project's writes are isolated on `aries/task/<job-id>`. Later slices verify and read that same branch rather than restarting from the default branch. Production/default branches remain untouched while implementation is incomplete.

Before a code-changing durable job can report normal completion, Viking Aries checks GitHub validation for the task branch when CI is available. Viking Aries itself validates `aries/**` branch pushes through the repository workflow. Pending validation is polled without another model call, failed validation returns to an implementation slice with the failure preserved in the checkpoint, and successful validation allows the job to finish or proceed to an explicitly requested release step.

Wire states remain lowercase for compatibility: `queued`, `running`, `completed`, `failed`, `canceled` (legacy `cancelled` is also recognized), `timed_out`, and `paused`. A per-slice safety checkpoint normally moves the same durable job back to `queued`; user-visible `paused` is reserved for a job-level guardrail or another condition that needs review. Terminal states cannot be overwritten by late success or failure.

The Cloudflare runner checks durable state every two seconds. Cancellation or an unavailable control endpoint aborts the signal inherited by provider and tool requests. The control request has a five-second timeout. The independent Convex watchdog expires a missing heartbeat after 60 seconds and enforces the four-minute execution deadline. Queued requests expire after 30 minutes. Legacy queued requests are not replayed.

## Limits and operations

- A timeout or Stop cannot undo a write already accepted by GitHub or another provider. Inspect verified action receipts before any manual retry.
- Abort stops further requests and closes in-flight transports. Provider-side billing already incurred, or generation accepted before transport loss, cannot be inferred solely from the local usage counter.
- Automatic continuation never replays a verified write merely because a new execution slice started.
- Validation polling is deliberately model-free so waiting on CI does not spend another AI slice.
- Job-level continuation, cost, and elapsed-time guardrails prevent an unbounded automatic loop.
- Production promotion, live customer-data changes, outbound communications, and other high-impact actions still require the authorization rules already enforced by Viking Aries.
- The live Worker calls `flippant-mandrill-487`, while deployment configuration remains separately managed. Deploy Convex functions/schema before relying on new lifecycle fields in the Worker.

## Regression coverage

`npm test` covers durable job claiming, duplicate submissions/deliveries, terminal-state races, continuation guardrails, request/tool/cost slicing, checkpoint preservation, provider/tool abort propagation, and usage accounting. `npm run build` validates critical files and builds the Worker and browser assets.
