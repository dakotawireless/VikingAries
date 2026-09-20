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


http.route({
  path: "/state",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const entries = await ctx.runQuery(internal.state.listState, {});
    return Response.json({ entries });
  }),
});

http.route({
  path: "/state",
  method: "PUT",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const body = await request.json();
      if (typeof body?.key !== "string" || typeof body?.value !== "string") {
        return Response.json({ error: "key and value are required." }, { status: 400 });
      }
      const key = body.key.slice(0, 240);
      const value = body.value;
      const updatedAt = Number(body.updatedAt || Date.now());
      if (!key.startsWith("viking-aries")) {
        return Response.json({ error: "Unsupported state key." }, { status: 400 });
      }
      if (value.length > 500000) {
        return Response.json({ error: "State value is too large." }, { status: 413 });
      }

      const result = await ctx.runMutation(internal.state.upsertState, {
        key,
        value,
        updatedAt,
      });
      return Response.json({ ok: true, ...result });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid state update." },
        { status: 400 }
      );
    }
  }),
});

http.route({
  path: "/state",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const key = (url.searchParams.get("key") || "").slice(0, 240);
    const updatedAt = Number(url.searchParams.get("updatedAt") || Date.now());
    if (!key.startsWith("viking-aries")) {
      return Response.json({ error: "Unsupported state key." }, { status: 400 });
    }

    const result = await ctx.runMutation(internal.state.deleteState, {
      key,
      updatedAt,
    });
    return Response.json({ ok: true, ...result });
  }),
});

export default http;
