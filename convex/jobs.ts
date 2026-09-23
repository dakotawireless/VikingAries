import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const RUNNER_URL = "https://vikingaries.dakotawireless.net/api/chat";
const HEARTBEAT_INTERVAL_MS = 5 * 1000;
const STALE_RUNNING_MS = 45 * 1000;
const STALE_QUEUED_MS = 2 * 60 * 1000;
const MAX_RUNNING_MS = 10 * 60 * 1000;

function isTerminalStatus(status: string) {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "timed_out"
  );
}

function terminalError(status: string) {
  if (status === "cancelled" || status === "canceled") return "Stopped by the owner.";
  if (status === "timed_out") return "The run timed out before completion.";
  return "The background job stopped before completion.";
}

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

export const getJobState = internalQuery({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .unique();
    if (!row) return null;
    return {
      jobId: row.jobId,
      status: row.status,
      startedAt: row.startedAt,
      heartbeatAt: row.heartbeatAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
    };
  },
});

export const heartbeatJob = internalMutation({
  args: { jobId: v.string(), at: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();

    if (!row) return null;
    if (row.status !== "running") return { status: row.status };

    const startedAt = row.startedAt || row.createdAt;
    if (args.at - startedAt >= MAX_RUNNING_MS) {
      await ctx.db.patch(row._id, {
        status: "timed_out",
        error: "The run exceeded the maximum execution time.",
        completedAt: args.at,
        heartbeatAt: args.at,
        updatedAt: args.at,
      });
      return { status: "timed_out" };
    }

    await ctx.db.patch(row._id, { heartbeatAt: args.at, updatedAt: args.at });
    return { status: "running" };
  },
});

export const reconcileProjectJobs = internalMutation({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_updatedAt", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(250);

    const now = Date.now();
    let reconciled = 0;

    for (const row of rows) {
      if (row.status === "running") {
        const lastHeartbeat = row.heartbeatAt || row.updatedAt || row.startedAt || row.createdAt;
        if (now - lastHeartbeat > STALE_RUNNING_MS) {
          await ctx.db.patch(row._id, {
            status: "timed_out",
            error: "The run stopped sending heartbeats and was timed out.",
            completedAt: now,
            updatedAt: now,
          });
          reconciled += 1;
        }
      } else if (row.status === "queued" && now - row.updatedAt > STALE_QUEUED_MS) {
        // Never replay old queued prompts during reconnect. New jobs are
        // scheduled when created; an abandoned queue entry becomes terminal.
        await ctx.db.patch(row._id, {
          status: "timed_out",
          error: "The queued run did not start before the queue timeout.",
          completedAt: now,
          updatedAt: now,
        });
        reconciled += 1;
      }
    }
    return { reconciled };
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
  args: { projectId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();

    const now = Date.now();
    for (const row of rows) {
      if (row.status === "running") {
        const lastHeartbeat = row.heartbeatAt || row.updatedAt || row.startedAt || row.createdAt;
        if (now - lastHeartbeat > STALE_RUNNING_MS) {
          await ctx.db.patch(row._id, {
            status: "timed_out",
            error: "The run stopped sending heartbeats and was timed out.",
            completedAt: now,
            updatedAt: now,
          });
        }
      } else if (row.status === "queued" && now - row.updatedAt > STALE_QUEUED_MS) {
        await ctx.db.patch(row._id, {
          status: "timed_out",
          error: "The queued run did not start before the queue timeout.",
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
      heartbeatAt: now,
      updatedAt: now,
      completedAt: undefined,
      error: undefined,
    });

    return { ...next, status: "running", startedAt: now, heartbeatAt: now, updatedAt: now };
  },
});

export const cancelThreadJobs = internalMutation({
  args: { projectId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("aiJobs")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .collect();

    const now = Date.now();
    let cancelled = 0;
    for (const row of rows) {
      if (row.status !== "queued" && row.status !== "running") continue;
      await ctx.db.patch(row._id, {
        status: "cancelled",
        error: "Stopped by the owner.",
        cancelRequestedAt: now,
        completedAt: now,
        updatedAt: now,
      });
      cancelled += 1;
    }
    return { cancelled, canceled: cancelled };
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
    if (!row || isTerminalStatus(row.status)) return false;

    await ctx.db.patch(row._id, {
      status: "completed",
      resultText: args.resultText,
      model: args.model || row.model,
      responseId: args.responseId,
      completedAt: args.completedAt,
      heartbeatAt: args.completedAt,
      updatedAt: args.completedAt,
      error: undefined,
    });
    return true;
  },
});

export const failJob = internalMutation({
  args: { jobId: v.string(), error: v.string(), completedAt: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row || isTerminalStatus(row.status)) return false;

    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error,
      completedAt: args.completedAt,
      heartbeatAt: args.completedAt,
      updatedAt: args.completedAt,
    });
    return true;
  },
});

function enrichMessagesForQueuedJobfunction enrichMessagesForQueuedJob(requestBody, currentJob, priorJobs) {
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
    if (
      prior.status !== "completed" &&
      prior.status !== "failed" &&
      prior.status !== "timed_out"
    ) continue;

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
      prior.status === "failed" || prior.status === "timed_out"
        ? `I couldn’t complete that request. ${prior.error || terminalError(prior.status)}`
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
  args: { projectId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.jobs.claimNextThreadJob, args);
    if (!job) return;

    const controller = new AbortController();
    let monitorStopped = false;
    let wakeMonitor: (() => void) | null = null;

    const monitorPromise = (async () => {
      while (!monitorStopped) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, HEARTBEAT_INTERVAL_MS);
          wakeMonitor = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        wakeMonitor = null;
        if (monitorStopped) break;

        try {
          const state = await ctx.runMutation(internal.jobs.heartbeatJob, {
            jobId: job.jobId,
            at: Date.now(),
          });
          if (!state || state.status !== "running") {
            controller.abort(
              new Error(
                state?.status === "cancelled" || state?.status === "canceled"
                  ? "RUN_CANCELLED"
                  : state?.status === "timed_out"
                    ? "RUN_TIMED_OUT"
                    : "RUN_TERMINATED"
              )
            );
            break;
          }
        } catch {
          controller.abort(new Error("RUN_HEARTBEAT_FAILED"));
          break;
        }
      }
    })();

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
        signal: controller.signal,
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
      const state = await ctx.runQuery(internal.jobs.getJobState, { jobId: job.jobId });
      if (!state || !isTerminalStatus(state.status)) {
        await ctx.runMutation(internal.jobs.failJob, {
          jobId: job.jobId,
          error: error instanceof Error ? error.message : "The AI job failed.",
          completedAt: Date.now(),
        });
      }
    } finally {
      monitorStopped = true;
      wakeMonitor?.();
      await monitorPromise.catch(() => undefined);
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, args);
    }
  },
});
