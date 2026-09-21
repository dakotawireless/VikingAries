import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const RUNNER_URL = "https://vikingaries.dakotawireless.net/api/chat";
const STALE_RUNNING_MS = 30 * 60 * 1000;

export const createJob = internalMutation({
  args: {
    jobId: v.string(),
    projectId: v.string(),
    projectName: v.string(),
    threadId: v.string(),
    threadTitle: v.string(),
    requestJson: v.string(),
    userMessageId: v.optional(v.string()),
    userMessageContent: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();

    if (existing) {
      return { jobId: existing.jobId, status: existing.status, duplicate: true };
    }

    await ctx.db.insert("aiJobs", {
      ...args,
      status: "queued",
      updatedAt: args.createdAt,
    });

    await ctx.scheduler.runAfter(0, internal.jobs.processThread, {
      projectId: args.projectId,
      threadId: args.threadId,
    });

    return { jobId: args.jobId, status: "queued", duplicate: false };
  },
});

export const listProjectJobs = internalQuery({
  args: {
    projectId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, limit }) => {
    const take = Math.min(100, Math.max(1, Math.floor(limit || 50)));
    return await ctx.db
      .query("aiJobs")
      .withIndex("by_project_updatedAt", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(take);
  },
});

export const listPriorThreadJobs = internalQuery({
  args: {
    projectId: v.string(),
    threadId: v.string(),
    beforeCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();

    return rows
      .filter((row) => row.createdAt < args.beforeCreatedAt)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const claimNextThreadJob = internalMutation({
  args: {
    projectId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();

    const now = Date.now();
    const staleBefore = now - STALE_RUNNING_MS;

    for (const row of rows) {
      if (row.status === "running" && row.updatedAt < staleBefore) {
        await ctx.db.patch(row._id, {
          status: "failed",
          error: "The background job stopped before completion.",
          completedAt: now,
          updatedAt: now,
        });
      }
    }

    const refreshed = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();

    if (refreshed.some((row) => row.status === "running")) return null;

    const next = refreshed
      .filter((row) => row.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    if (!next) return null;

    await ctx.db.patch(next._id, {
      status: "running",
      startedAt: now,
      updatedAt: now,
      error: undefined,
    });

    return { ...next, status: "running", startedAt: now, updatedAt: now };
  },
});

export const cancelThreadJobs = internalMutation({
  args: {
    projectId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();
    const now = Date.now();
    let canceled = 0;
    for (const row of rows) {
      if (row.status !== "queued" && row.status !== "running") continue;
      await ctx.db.patch(row._id, {
        status: "canceled",
        error: "Stopped by the owner.",
        completedAt: now,
        updatedAt: now,
      });
      canceled += 1;
    }
    return { canceled };
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.string(),
    resultText: v.string(),
    model: v.optional(v.string()),
    responseId: v.optional(v.string()),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row || row.status === "canceled") return false;

    await ctx.db.patch(row._id, {
      status: "completed",
      resultText: args.resultText,
      model: args.model || row.model,
      responseId: args.responseId,
      completedAt: args.completedAt,
      updatedAt: args.completedAt,
      error: undefined,
    });
    return true;
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.string(),
    error: v.string(),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row || row.status === "canceled") return false;

    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error,
      completedAt: args.completedAt,
      updatedAt: args.completedAt,
    });
    return true;
  },
});

function enrichMessagesForQueuedJob(requestBody, currentJob, priorJobs) {
  const messages = Array.isArray(requestBody?.messages)
    ? requestBody.messages.map((message) => ({ ...message }))
    : [];

  const currentUserId = currentJob.userMessageId || "";
  const findUserIndex = (job) =>
    messages.findIndex(
      (message) =>
        message?.role === "user" &&
        ((job.userMessageId && message.id === job.userMessageId) ||
          message.jobId === job.jobId)
    );

  const findCurrentUserIndex = () => {
    const exact = messages.findIndex(
      (message) =>
        message?.role === "user" &&
        ((currentUserId && message.id === currentUserId) ||
          message.jobId === currentJob.jobId)
    );
    if (exact >= 0) return exact;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") return index;
    }
    return messages.length;
  };

  for (const prior of priorJobs) {
    if (prior.status !== "completed" && prior.status !== "failed") continue;

    let userIndex = findUserIndex(prior);
    if (userIndex < 0 && prior.userMessageContent) {
      const insertAt = findCurrentUserIndex();
      messages.splice(insertAt, 0, {
        id: prior.userMessageId || `user-${prior.jobId}`,
        jobId: prior.jobId,
        role: "user",
        content: prior.userMessageContent,
      });
      userIndex = insertAt;
    }

    if (userIndex < 0) continue;

    const assistantId = `assistant-${prior.jobId}`;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message?.role === "assistant" &&
        (message.id === assistantId || message.jobId === prior.jobId)
      ) {
        messages.splice(index, 1);
      }
    }

    const assistantContent =
      prior.status === "failed"
        ? `I couldn’t complete that request. ${prior.error || "The background job failed."}`
        : prior.resultText;

    if (assistantContent) {
      userIndex = findUserIndex(prior);
      messages.splice(userIndex + 1, 0, {
        id: assistantId,
        jobId: prior.jobId,
        role: "assistant",
        content: assistantContent,
      });
    }
  }

  requestBody.messages = messages;
  return requestBody;
}

export const processThread = internalAction({
  args: {
    projectId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.jobs.claimNextThreadJob, args);
    if (!job) return;

    try {
      const secret = process.env.VA_USAGE_INGEST_SECRET;
      if (!secret) throw new Error("VA_USAGE_INGEST_SECRET is not configured in Convex.");

      const requestBody = JSON.parse(job.requestJson);
      const priorJobs = await ctx.runQuery(internal.jobs.listPriorThreadJobs, {
        projectId: job.projectId,
        threadId: job.threadId,
        beforeCreatedAt: job.createdAt,
      });

      enrichMessagesForQueuedJob(requestBody, job, priorJobs);

      const response = await fetch(RUNNER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VA-Internal-Job-Secret": secret,
        },
        body: JSON.stringify(requestBody),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `AI job runner returned status ${response.status}.`);
      }

      await ctx.runMutation(internal.jobs.completeJob, {
        jobId: job.jobId,
        resultText: String(payload?.text || "The AI job completed without response text."),
        model: typeof payload?.model === "string" ? payload.model : undefined,
        responseId: typeof payload?.responseId === "string" ? payload.responseId : undefined,
        completedAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.jobs.failJob, {
        jobId: job.jobId,
        error: error instanceof Error ? error.message : "The AI job failed.",
        completedAt: Date.now(),
      });
    } finally {
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, args);
    }
  },
});
