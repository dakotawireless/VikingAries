# Viking Aries Project-Chat Requirements

This document is the durable requirements addendum for the Viking Aries project-chat prompt. It applies to Viking Aries and does not authorize changes to Timekeeper unless explicitly approved.

## Global API usage and credit counter

- Treat usage as a Viking Aries-wide feature, not a project-specific feature.
- Aggregate usage across all projects managed by Viking Aries.
- Add a compact current-billing-period usage indicator in the left sidebar near Log Out.
- Show usage, remaining budget or credits when configured, percentage used where possible, and the last-updated timestamp.
- Make the indicator open a detailed usage view with total requests, tokens when available, estimated cost or credits, usage grouped by project, usage grouped by provider/model when available, billing period, and refresh timestamp.
- Provide clear loading, empty, unavailable, estimated, and error states.
- Inspect and reuse existing usage tracking before creating accounting. Track usage server-side and aggregate it securely.
- Never expose API keys, provider secrets, or secret values to the browser or AI layer. Use secure-vault and environment-variable conventions.
- If provider billing APIs are unavailable, label values as estimated. If exact credit data cannot be retrieved, show request/token usage and Unavailable or Estimated rather than inventing a value.
- Make aggregation resilient when one provider or project fails.
- Add required schema, backend functions, UI, tests, and documentation while preserving existing behavior and styling.
- Do not deploy or change production secrets without explicit approval.

## Cross-project task handoff

Viking Aries must support moving or handing off a task from the current project chat to another project chat without mixing project scope.

- Let the user choose a destination project from the project list.
- Support both Move task (transfer active ownership/context) and Copy/hand off task (create a linked destination task while retaining the source task).
- Preserve the original conversation reference, title, description, requirements, attachments/repository references, and relevant status.
- Clearly record and display source project, destination project, transfer type, initiating user, and timestamp.
- Require confirmation before completing a move or copy.
- Prevent accidental code changes in the wrong repository after handoff. Never silently move a conversation or change project scope.
- Add an audit trail for every handoff and preserve links between source and destination tasks so status can be followed.
- The destination chat must receive a concise context packet containing: task objective, current status, decisions already made, files or repositories involved, required tools or provider connections, pending questions, and explicit scope and non-scope.
- Keep project-specific credentials, secrets, deployment details, and repository write permissions scoped to the destination project. Never expose secret values during handoff.
- If the destination project is unavailable, show a clear error and leave the original task unchanged.
- Make the UI clear when a task has been moved, copied, or handed off.

## AI response copy button

- Move the Copy button for AI responses from the top of each response to the bottom of the chat message.
- Place it in the response footer alongside other response actions.
- Preserve existing copy behavior, success feedback, accessibility labels, and keyboard support.
- Keep the button visible without covering response content.
- Ensure it works for short, long, streamed, and error responses.
- Match existing Viking Aries styling and responsive layout.
- Remove the duplicate top-positioned copy button unless another response action specifically depends on that location.
- Add or update UI tests covering copy success and failure states.

## Implementation safety

Before implementing these requirements, report the relevant files, existing usage/billing architecture, project/chat/task data model, whether cross-project transfer already exists, providers capable of exact usage or billing data, and missing credentials, permissions, or provider connections. After implementation, run available tests and checks, summarize changed files and behavior, report required environment-variable or vault-entry names only, and provide commit and deployment status when applicable.
