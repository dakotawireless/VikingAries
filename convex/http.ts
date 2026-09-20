import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function authorized(request: Request) {
  const expected = process.env.VA_USAGE_INGEST_SECRET;
  if (!expected) return false;
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

http.route({
  path: "/usage/record",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const body = await request.json();
      const id = await ctx.runMutation(internal.usage.recordUsage, body);
      return Response.json({ ok: true, id });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid usage record." },
        { status: 400 }
      );
    }
  }),
});

http.route({
  path: "/usage/summary",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const requestedDays = Number(url.searchParams.get("days") || 30);
    const days = Number.isFinite(requestedDays)
      ? Math.min(365, Math.max(1, Math.floor(requestedDays)))
      : 30;
    const summary = await ctx.runQuery(internal.usage.usageSummary, { days });
    return Response.json(summary);
  }),
});

export default http;
