import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function authorized(request: Request) {
  const expected = process.env.VA_USAGE_INGEST_SECRET;
  if (!expected) return false;
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;

function safeFileName(value: unknown) {
  const name = String(value || "file")
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .trim();
  return (name || "file").slice(0, 180);
}

http.route({
  path: "/files/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const form = await request.formData();
      const projectId = String(form.get("projectId") || "").trim().slice(0, 120);
      const file = form.get("file");
      if (!projectId || !(file instanceof Blob)) {
        return Response.json({ error: "projectId and file are required." }, { status: 400 });
      }
      if (file.size <= 0 || file.size > MAX_PROJECT_FILE_BYTES) {
        return Response.json({ error: "Files must be between 1 byte and 10 MB." }, { status: 413 });
      }

      const submittedName = typeof (file as Blob & { name?: unknown }).name === "string"
        ? (file as Blob & { name: string }).name
        : "file";
      const name = safeFileName(submittedName);
      const type = String(file.type || "application/octet-stream").slice(0, 180);
      const storageId = await ctx.storage.store(file);
      try {
        const id = await ctx.runMutation(internal.files.createProjectFile, {
          projectId,
          name,
          type,
          size: file.size,
          storageId,
          uploadedAt: Date.now(),
        });
        return Response.json({
          ok: true,
          file: { id, projectId, name, type, size: file.size, uploadedAt: Date.now() },
        });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not upload file." },
        { status: 400 }
      );
    }
  }),
});

http.route({
  path: "/files/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim().slice(0, 120) || "";
    if (!projectId) return Response.json({ error: "projectId is required." }, { status: 400 });

    const files = await ctx.runQuery(internal.files.listProjectFiles, { projectId });
    return Response.json({
      ok: true,
      files: files.map((file) => ({
        id: file._id,
        projectId: file.projectId,
        name: file.name,
        type: file.type,
        size: file.size,
        uploadedAt: file.uploadedAt,
        status: "Stored",
        storage: "convex",
      })),
    });
  }),
});

http.route({
  path: "/files/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const projectId = url.searchParams.get("projectId")?.trim().slice(0, 120) || "";
    try {
      const file = await ctx.runQuery(internal.files.getProjectFile, { id: id as any });
      if (!file || file.projectId !== projectId) {
        return Response.json({ error: "File not found." }, { status: 404 });
      }
      const blob = await ctx.storage.get(file.storageId);
      if (!blob) return Response.json({ error: "Stored file is unavailable." }, { status: 404 });
      return new Response(blob, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "Content-Length": String(file.size),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return Response.json({ error: "File not found." }, { status: 404 });
    }
  }),
});

http.route({
  path: "/files/delete",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    const projectId = url.searchParams.get("projectId")?.trim().slice(0, 120) || "";
    try {
      const file = await ctx.runQuery(internal.files.getProjectFile, { id: id as any });
      if (!file || file.projectId !== projectId) {
        return Response.json({ error: "File not found." }, { status: 404 });
      }
      await ctx.storage.delete(file.storageId);
      await ctx.runMutation(internal.files.deleteProjectFile, { id: file._id });
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: "File not found." }, { status: 404 });
    }
  }),
});

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
    const days = requestedDays === 0 ? 0 : Number.isFinite(requestedDays)
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

http.route({
  path: "/jobs/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const body = await request.json();
      const jobId = typeof body?.jobId === "string" ? body.jobId.slice(0, 120) : "";
      const projectId = typeof body?.projectId === "string" ? body.projectId.slice(0, 120) : "";
      const projectName = typeof body?.projectName === "string" ? body.projectName.slice(0, 160) : "";
      const threadId = typeof body?.threadId === "string" ? body.threadId.slice(0, 160) : "";
      const threadTitle = typeof body?.threadTitle === "string" ? body.threadTitle.slice(0, 200) : "";
      const requestJson = typeof body?.requestJson === "string" ? body.requestJson : "";
      const userMessageId =
        typeof body?.userMessageId === "string" ? body.userMessageId.slice(0, 180) : undefined;
      const userMessageContent =
        typeof body?.userMessageContent === "string" ? body.userMessageContent.slice(0, 20000) : undefined;
      const model = typeof body?.model === "string" ? body.model.slice(0, 120) : undefined;

      if (!jobId || !projectId || !threadId || !requestJson) {
        return Response.json(
          { error: "jobId, projectId, threadId, and requestJson are required." },
          { status: 400 }
        );
      }
      if (requestJson.length > 12000000) {
        return Response.json({ error: "AI job request is too large." }, { status: 413 });
      }

      const result = await ctx.runMutation(internal.jobs.createJob, {
        jobId,
        projectId,
        projectName: projectName || projectId,
        threadId,
        threadTitle: threadTitle || "Untitled chat",
        requestJson,
        userMessageId,
        userMessageContent,
        model,
        createdAt: Date.now(),
      });
      return Response.json(result);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not create AI job." },
        { status: 400 }
      );
    }
  }),
});

http.route({
  path: "/jobs/cancel",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
      const body = await request.json();
      const projectId = typeof body?.projectId === "string" ? body.projectId.slice(0, 120) : "";
      const threadId = typeof body?.threadId === "string" ? body.threadId.slice(0, 160) : "";
      if (!projectId || !threadId) {
        return Response.json({ error: "projectId and threadId are required." }, { status: 400 });
      }
      const result = await ctx.runMutation(internal.jobs.cancelThreadJobs, { projectId, threadId });
      return Response.json({ ok: true, ...result });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Could not stop AI jobs." },
        { status: 400 }
      );
    }
  }),
});

http.route({
  path: "/jobs/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = (url.searchParams.get("projectId") || "").slice(0, 120);
    const requestedLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 50;

    if (!projectId) {
      return Response.json({ error: "projectId is required." }, { status: 400 });
    }

    await ctx.runMutation(internal.jobs.reconcileProjectJobs, { projectId });
    const jobs = await ctx.runQuery(internal.jobs.listProjectJobs, { projectId, limit });
    return Response.json({
      jobs: jobs.map((job) => ({
        jobId: job.jobId,
        projectId: job.projectId,
        projectName: job.projectName,
        threadId: job.threadId,
        threadTitle: job.threadTitle,
        userMessageId: job.userMessageId,
        userMessageContent: job.userMessageContent,
        status: job.status,
        resultText: job.resultText,
        error: job.error,
        model: job.model,
        responseId: job.responseId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAt: job.startedAt,
        heartbeatAt: job.heartbeatAt,
        cancelRequestedAt: job.cancelRequestedAt,
        completedAt: job.completedAt,
      })),
    });
  }),
});

export default http;
