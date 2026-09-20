# API Counter

Verified baseline (2026-09-20): the live owner session showed 85 OpenAI calls,
2,697,419 input tokens, 46,207 output tokens and about $2.02 estimated spend.
The Worker ingestion-secret binding was present and the authenticated summary
successfully read Convex. The saved "Needs configuration" secret labels are
static metadata, not live diagnostics. No credential was changed.

## Behavior

- The dollar-only all-time ticker sits beside Log Out at the bottom left.
  The existing API Usage navigation button opens details.
- Both refresh every 15 seconds while visible and on returning to the window.
- Totals cover all VA projects; the page provides model and project breakdowns.
- Today uses the existing server UTC day. "24 hours" is the rolling one-day range.
- USD costs use standard published model rates (including cached input, cache
  writes and long context). Reasoning is included in output, not charged twice.
- Each model response with usage is persisted before the next tool/model step,
  including incomplete responses and responses preceding a later failure.
- Storage failures leave chat working and include a visible counter warning in
  the response (also preserved by the existing background-job system).
- Failed refreshes show unavailable status rather than an invented zero balance.

## Scope and limits

This tracks OpenAI model usage initiated by VA, not provider account balance,
all account API activity, or Cloudflare/Convex/GitHub service charges. Provider
invoices remain authoritative. Old records may combine several calls; new
records represent individual model responses. No historical records are
rewritten or backfilled. Usage lost before this fix cannot be reconstructed
from saved chat text. A provider/network failure without a returned usage
payload cannot be measured. A storage outage can still lose a record; warnings
make this visible rather than falsely reporting full coverage.

## Deployment and checks

No schema migration or secret rotation is needed. Deploy the normal frontend
and Worker build together. Existing Convex usage endpoints remain compatible.
Run npm test and npm run build. In the authenticated app check that the counter
and API Usage totals agree, that a new chat increments the count automatically,
and that project switching, tabs, composer and preview remain usable.
