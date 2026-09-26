import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const RUNNER_URL = "https://vikingaries.dakotawireless.net/api/chat";
import {
  expiryReason,
  RUN_LIMIT_MS,
  DEFAULT_JOB_MAX_CONTINUATIONS,
  DEFAULT_JOB_MAX_COST_USD,
  DEFAULT_JOB_MAX_ELAPSED_MS,
  jobContinuationLimitReason,
  CURRENT_JOB_LIFECYCLE_VERSION,
  isRunnableQueuedJob,
} from "../shared/run-lifecycle.js";

function workBranchForJob(jobId: string) {
  const safe = String(jobId || "job")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `aries/task/${safe || "job"}`;
}

function clipSummaryText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function jobSummary(job: any) {
  return {
    jobId: job.jobId,
    projectId: job.projectId,
    projectName: job.projectName,
    threadId: job.threadId,
    threadTitle: clipSummaryText(job.threadTitle, 240) || "Untitled chat",
    userMessageId: clipSummaryText(job.userMessageId, 180),
    userMessageContent: clipSummaryText(job.userMessageContent, 24000),
    status: job.status,
    resultText: clipSummaryText(job.resultText, 120000),
    error: clipSummaryText(job.error, 24000),
    model: clipSummaryText(job.model, 160),
    responseId: clipSummaryText(job.responseId, 240),
    stopReason: clipSummaryText(job.stopReason, 24000),
    createdAt: Number(job.createdAt || Date.now()),
    updatedAt: Number(job.updatedAt || job.createdAt || Date.now()),
    startedAt: job.startedAt,
    cancelRequestedAt: job.cancelRequestedAt,
    deadlineAt: job.deadlineAt,
    lifecycleVersion: job.lifecycleVersion,
    continuationCount: job.continuationCount,
    cumulativeCostUsd: job.cumulativeCostUsd,
    jobStartedAt: job.jobStartedAt,
    maxContinuations: job.maxContinuations,
    maxJobCostUsd: job.maxJobCostUsd,
    maxJobElapsedMs: job.maxJobElapsedMs,
    workBranch: clipSummaryText(job.workBranch, 240),
    completedAt: job.completedAt,
  };
}

async function syncJobSummary(ctx: any, job: any) {
  const summary = jobSummary(job);
  const existing = await ctx.db
    .query("aiJobSummaries")
    .withIndex("by_jobId", (q: any) => q.eq("jobId", summary.jobId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, summary);
  } else {
    await ctx.db.insert("aiJobSummaries", summary);
  }
}

async function getFullJobById(ctx: any, jobId: string) {
  return ctx.db.query("aiJobs").withIndex("by_jobId", (q: any) => q.eq("jobId", jobId)).unique();
}

async function patchFullJob(ctx: any, row: any, patch: Record<string, unknown>) {
  await ctx.db.patch(row._id, patch);
  await syncJobSummary(ctx, { ...row, ...patch });
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
    maxContinuations: v.optional(v.number()),
    maxJobCostUsd: v.optional(v.number()),
    maxJobElapsedMs: v.optional(v.number()),
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

    if (args.userMessageId) {
      const duplicate = await ctx.db.query("aiJobs").withIndex("by_project_thread_user", q => q.eq("projectId", args.projectId).eq("threadId", args.threadId).eq("userMessageId", args.userMessageId)).first();
      if (duplicate) return { jobId: duplicate.jobId, status: duplicate.status, duplicate: true };
    }

    const now = Date.now();
    const activeRows = (await Promise.all(["queued", "running"].map(status =>
      ctx.db.query("aiJobSummaries")
        .withIndex("by_project_thread_status", q => q.eq("projectId", args.projectId).eq("threadId", args.threadId).eq("status", status))
        .collect()
    ))).flat();
    for (const summary of activeRows) {
      const reason = expiryReason(summary, now);
      if (!reason) continue;
      const full = await getFullJobById(ctx, summary.jobId);
      if (full) {
        await patchFullJob(ctx, full, {
          status: "timed_out",
          error: reason,
          stopReason: reason,
          completedAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(summary._id, {
          status: "timed_out",
          error: reason,
          stopReason: reason,
          completedAt: now,
          updatedAt: now,
        });
      }
    }

    const newJob = {
      ...args,
      status: "queued",
      lifecycleVersion: CURRENT_JOB_LIFECYCLE_VERSION,
      continuationCount: 0,
      cumulativeCostUsd: 0,
      jobStartedAt: args.createdAt,
      maxContinuations: args.maxContinuations ?? DEFAULT_JOB_MAX_CONTINUATIONS,
      maxJobCostUsd: args.maxJobCostUsd ?? DEFAULT_JOB_MAX_COST_USD,
      maxJobElapsedMs: args.maxJobElapsedMs ?? DEFAULT_JOB_MAX_ELAPSED_MS,
      workBranch: workBranchForJob(args.jobId),
      updatedAt: args.createdAt,
    };
    await ctx.db.insert("aiJobs", newJob);
    await syncJobSummary(ctx, newJob);

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
    const recent = await ctx.db
      .query("aiJobSummaries")
      .withIndex("by_project_updatedAt", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(take);
    const active = (await Promise.all(["queued", "running"].map(status =>
      ctx.db.query("aiJobSummaries")
        .withIndex("by_project_status", q => q.eq("projectId", projectId).eq("status", status))
        .take(100)
    ))).flat();
    return [...new Map([...recent, ...active].map(row => [row.jobId, row])).values()];
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
      .query("aiJobSummaries")
      .withIndex("by_project_thread_updatedAt", (q) =>
        q.eq("projectId", args.projectId).eq("threadId", args.threadId)
      )
      .order("desc").take(14);

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
    const summaries = (await Promise.all(["queued", "running"].map(status =>
      ctx.db.query("aiJobSummaries")
        .withIndex("by_project_thread_status", q => q.eq("projectId", args.projectId).eq("threadId", args.threadId).eq("status", status))
        .collect()
    ))).flat();

    const now = Date.now();
    for (const summary of summaries) {
      const reason = expiryReason(summary, now);
      if (!reason) continue;
      const full = await getFullJobById(ctx, summary.jobId);
      if (full) {
        await patchFullJob(ctx, full, {
          status: "timed_out",
          error: reason,
          stopReason: reason,
          completedAt: now,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(summary._id, {
          status: "timed_out",
          error: reason,
          stopReason: reason,
          completedAt: now,
          updatedAt: now,
        });
      }
    }

    const refreshed = (await Promise.all(["queued", "running"].map(status =>
      ctx.db.query("aiJobSummaries")
        .withIndex("by_project_thread_status", q => q.eq("projectId", args.projectId).eq("threadId", args.threadId).eq("status", status))
        .collect()
    ))).flat();

    if (refreshed.some((row) => row.status === "running")) return null;

    const next = refreshed
      .filter((row) => isRunnableQueuedJob(row, now))
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return null;

    const full = await getFullJobById(ctx, next.jobId);
    if (!full) {
      await ctx.db.patch(next._id, {
        status: "failed",
        error: "Execution payload is missing.",
        completedAt: now,
        updatedAt: now,
      });
      return null;
    }

    const patch = {
      status: "running",
      startedAt: now,
      deadlineAt: now + RUN_LIMIT_MS,
      runnerClaimed: false,
      lastSliceStartedAt: now,
      updatedAt: now,
      error: undefined,
    };
    await patchFullJob(ctx, full, patch);
    return { ...full, ...patch };
  },
});

export const cancelThreadJobs = internalMutation({
  args: {
    projectId: v.string(),
    threadId: v.string(),
    jobIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const rows = (await Promise.all(["queued", "running"].map(status =>
      ctx.db.query("aiJobSummaries")
        .withIndex("by_project_thread_status", q => q.eq("projectId", args.projectId).eq("threadId", args.threadId).eq("status", status))
        .collect()
    ))).flat();
    const now = Date.now();
    const requestedIds = new Set((args.jobIds || []).map((id) => String(id || "").trim()).filter(Boolean));
    const canceledIds = new Set<string>();

    const cancelById = async (jobId: string) => {
      const full = await getFullJobById(ctx, jobId);
      const patch = {
        status: "canceled",
        error: "Stopped by the owner.",
        stopReason: "User cancellation",
        resultText: "Stopped by the owner.",
        cancelRequestedAt: now,
        runnerClaimed: false,
        completedAt: now,
        updatedAt: now,
      };
      if (full && full.projectId === args.projectId && full.threadId === args.threadId) {
        await patchFullJob(ctx, full, patch);
        canceledIds.add(jobId);
        return true;
      }
      const summary = await ctx.db
        .query("aiJobSummaries")
        .withIndex("by_jobId", q => q.eq("jobId", jobId))
        .unique();
      if (summary && summary.projectId === args.projectId && summary.threadId === args.threadId) {
        await ctx.db.patch(summary._id, patch);
        canceledIds.add(jobId);
        return true;
      }
      return false;
    };

    for (const row of rows) {
      if (row.status !== "queued" && row.status !== "running") continue;
      await cancelById(row.jobId);
    }

    // Fence Stop against a job creation race. Requested IDs that are not yet
    // persisted get a tiny canceled payload + summary so a late create is a duplicate.
    for (const jobId of requestedIds) {
      if (canceledIds.has(jobId)) continue;
      if (await cancelById(jobId)) continue;

      const canceledJob = {
        jobId,
        projectId: args.projectId,
        projectName: args.projectId,
        threadId: args.threadId,
        threadTitle: "Canceled before queue",
        requestJson: "{}",
        userMessageId: `user-${jobId}`,
        status: "canceled",
        resultText: "Stopped by the owner.",
        error: "Stopped by the owner.",
        stopReason: "User cancellation",
        createdAt: now,
        updatedAt: now,
        cancelRequestedAt: now,
        lifecycleVersion: CURRENT_JOB_LIFECYCLE_VERSION,
        continuationCount: 0,
        cumulativeCostUsd: 0,
        jobStartedAt: now,
        completedAt: now,
      };
      await ctx.db.insert("aiJobs", canceledJob);
      await syncJobSummary(ctx, canceledJob);
      canceledIds.add(jobId);
    }

    return { canceled: canceledIds.size, jobIds: [...canceledIds] };
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.string(),
    resultText: v.string(),
    model: v.optional(v.string()),
    responseId: v.optional(v.string()),
    sliceCostUsd: v.optional(v.number()),
    checkpointJson: v.optional(v.string()),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row || row.status !== "running") return false;
    const expired = expiryReason(row, Date.now());
    if (expired) {
      await ctx.db.patch(row._id, { status: "timed_out", error: expired, completedAt: Date.now(), updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, { projectId: row.projectId, threadId: row.threadId });
      return false;
    }

    const cumulativeCostUsd =
      Number(row.cumulativeCostUsd || 0) + Math.max(0, Number(args.sliceCostUsd || 0));

    await ctx.db.patch(row._id, {
      status: "completed",
      resultText: args.resultText,
      model: args.model || row.model,
      responseId: args.responseId,
      cumulativeCostUsd,
      checkpointJson: args.checkpointJson || row.checkpointJson,
      lastSliceCompletedAt: args.completedAt,
      completedAt: args.completedAt,
      updatedAt: args.completedAt,
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.jobs.processThread, { projectId: row.projectId, threadId: row.threadId });
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
    if (!row || row.status !== "running") return false;

    await ctx.db.patch(row._id, {
      status: expiryReason(row, Date.now()) ? "timed_out" : "failed",
      error: args.error,
      completedAt: args.completedAt,
      updatedAt: args.completedAt,
    });
    await ctx.scheduler.runAfter(0, internal.jobs.processThread, { projectId: row.projectId, threadId: row.threadId });
    return true;
  },
});

export const continueJobSlice = internalMutation({
  args: {
    jobId: v.string(),
    resultText: v.string(),
    stopReason: v.string(),
    diagnosticsJson: v.optional(v.string()),
    checkpointJson: v.optional(v.string()),
    responseId: v.optional(v.string()),
    sliceCostUsd: v.optional(v.number()),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row || row.status !== "running") {
      return { continued: false, status: row?.status || "missing", reason: "Job is no longer running." };
    }

    const cumulativeCostUsd =
      Number(row.cumulativeCostUsd || 0) + Math.max(0, Number(args.sliceCostUsd || 0));
    const validationWait = /(?:validation|deployment).*(?:pending|waiting|unavailable)/i.test(args.stopReason || "");
    const nextContinuationCount =
      Number(row.continuationCount || 0) + (validationWait ? 0 : 1);
    const now = args.completedAt;
    const limitReason = jobContinuationLimitReason(row, {
      nextContinuationCount,
      nextCumulativeCostUsd: cumulativeCostUsd,
      now,
    });

    if (limitReason) {
      const finalText = [
        args.resultText,
        "",
        `Automatic continuation paused because the durable job guardrail was reached: ${limitReason}`,
        "Completed writes and checkpoints are preserved. Review the job before starting another continuation.",
      ].filter(Boolean).join("\n");

      await ctx.db.patch(row._id, {
        status: "paused",
        resultText: finalText,
        error: limitReason,
        stopReason: limitReason,
        diagnosticsJson: args.diagnosticsJson,
        checkpointJson: args.checkpointJson || row.checkpointJson,
        responseId: args.responseId || row.responseId,
        continuationCount: nextContinuationCount,
        cumulativeCostUsd,
        lastSliceCompletedAt: now,
        completedAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, {
        projectId: row.projectId,
        threadId: row.threadId,
      });
      return { continued: false, status: "paused", reason: limitReason, continuationCount: nextContinuationCount };
    }

    await ctx.db.patch(row._id, {
      status: "queued",
      resultText: args.resultText,
      error: undefined,
      stopReason: args.stopReason,
      diagnosticsJson: args.diagnosticsJson,
      checkpointJson: args.checkpointJson || row.checkpointJson,
      responseId: args.responseId || row.responseId,
      continuationCount: nextContinuationCount,
      cumulativeCostUsd,
      runnerClaimed: false,
      startedAt: undefined,
      deadlineAt: undefined,
      lastSliceCompletedAt: now,
      completedAt: undefined,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      validationWait ? 10000 : 150,
      internal.jobs.processThread,
      {
        projectId: row.projectId,
        threadId: row.threadId,
      }
    );

    return {
      continued: true,
      status: "queued",
      continuationCount: nextContinuationCount,
      cumulativeCostUsd,
      workBranch: row.workBranch,
    };
  },
});

export const finalizeInterruptedJob = internalMutation({
  args: {
    jobId: v.string(),
    status: v.string(),
    resultText: v.string(),
    stopReason: v.string(),
    diagnosticsJson: v.optional(v.string()),
    sliceCostUsd: v.optional(v.number()),
    checkpointJson: v.optional(v.string()),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiJobs")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    if (!row) return false;

    const allowed = new Set(["paused", "timed_out", "canceled", "failed"]);
    const status = allowed.has(args.status) ? args.status : "failed";
    if (!["running", "canceled", "timed_out", "failed", "paused"].includes(row.status)) return false;

    const cumulativeCostUsd =
      Number(row.cumulativeCostUsd || 0) + Math.max(0, Number(args.sliceCostUsd || 0));

    await ctx.db.patch(row._id, {
      status: row.status === "canceled" ? "canceled" : row.status === "timed_out" ? "timed_out" : status,
      resultText: args.resultText,
      error: args.stopReason,
      stopReason: args.stopReason,
      diagnosticsJson: args.diagnosticsJson,
      checkpointJson: args.checkpointJson || row.checkpointJson,
      cumulativeCostUsd,
      lastSliceCompletedAt: args.completedAt,
      completedAt: args.completedAt,
      updatedAt: args.completedAt,
    });
    await ctx.scheduler.runAfter(0, internal.jobs.processThread, {
      projectId: row.projectId,
      threadId: row.threadId,
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
    if (!["completed", "failed", "canceled", "timed_out", "paused"].includes(prior.status)) continue;

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
      prior.resultText ||
      (prior.status !== "completed"
        ? `I couldn’t complete that request. ${prior.error || "The background job failed."}`
        : "");

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
        body: JSON.stringify({
          ...requestBody,
          jobId: job.jobId,
          autoContinuation: Number(job.continuationCount || 0) > 0,
          continuationCount: Number(job.continuationCount || 0),
          durableCheckpoint: job.checkpointJson || null,
          workBranch: job.workBranch || null,
          jobPolicy: {
            maxContinuations: job.maxContinuations ?? DEFAULT_JOB_MAX_CONTINUATIONS,
            maxJobCostUsd: job.maxJobCostUsd ?? DEFAULT_JOB_MAX_COST_USD,
            maxJobElapsedMs: job.maxJobElapsedMs ?? DEFAULT_JOB_MAX_ELAPSED_MS,
          },
        }),
        signal: AbortSignal.timeout(RUN_LIMIT_MS + 10000),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `AI job runner returned status ${response.status}.`);
      }

      const interruptedStatus = String(payload?.executionStatus || "");
      const diagnostics =
        payload?.diagnostics && typeof payload.diagnostics === "object"
          ? payload.diagnostics
          : {};
      const sliceCostUsd = Math.max(0, Number(payload?.usage?.estimatedCostUsd || 0));
      const checkpointJson = JSON.stringify({
        text: String(payload?.text || ""),
        diagnostics,
        actionReceipts: Array.isArray(payload?.actionReceipts)
          ? payload.actionReceipts.slice(-30)
          : [],
        responseId: typeof payload?.responseId === "string" ? payload.responseId : null,
        workBranch: job.workBranch || null,
        continuationCount: Number(job.continuationCount || 0),
        recordedAt: Date.now(),
      });

      if (interruptedStatus === "paused" && payload?.continuationRequired !== false) {
        const continuation = await ctx.runMutation(internal.jobs.continueJobSlice, {
          jobId: job.jobId,
          resultText: String(
            payload?.text ||
              "The current execution slice reached its safety budget. Viking Aries is continuing automatically from the saved checkpoint."
          ),
          stopReason: String(diagnostics.stopReason || "Execution slice checkpoint"),
          diagnosticsJson: JSON.stringify(diagnostics),
          checkpointJson,
          responseId: typeof payload?.responseId === "string" ? payload.responseId : undefined,
          sliceCostUsd,
          completedAt: Date.now(),
        });
        if (continuation?.continued) return;
        return;
      }

      if (["timed_out", "canceled", "failed"].includes(interruptedStatus)) {
        await ctx.runMutation(internal.jobs.finalizeInterruptedJob, {
          jobId: job.jobId,
          status: interruptedStatus,
          resultText: String(
            payload?.text ||
              "The durable job stopped before normal completion. Completed writes and checkpoints remain preserved."
          ),
          stopReason: String(
            diagnostics.stopReason ||
              (interruptedStatus === "timed_out"
                ? "Execution timeout"
                : interruptedStatus === "canceled"
                  ? "User cancellation"
                  : "AI runner failure")
          ),
          diagnosticsJson: JSON.stringify(diagnostics),
          checkpointJson,
          sliceCostUsd,
          completedAt: Date.now(),
        });
        return;
      }

      await ctx.runMutation(internal.jobs.completeJob, {
        jobId: job.jobId,
        resultText: String(payload?.text || "The AI job completed without response text."),
        model: typeof payload?.model === "string" ? payload.model : undefined,
        responseId: typeof payload?.responseId === "string" ? payload.responseId : undefined,
        sliceCostUsd,
        checkpointJson,
        completedAt: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI job failed.";
      const timedOut = /timeout|timed out|deadline|abort/i.test(message);
      const stopReason = timedOut ? "Execution timeout" : "Backend/runtime failure";
      const resultText = [
        `## Stop reason\n${stopReason}.`,
        "## What was completed\nThe durable runner stopped before it could return its final structured checkpoint. Any completed Activity steps and verified action receipts remain preserved.",
        `## Where it stopped\n${message}`,
        "## What remains\nResume from the saved run checkpoint and perform only the unfinished work.",
        "## Change safety\nThe final runner response was not returned, so this finalizer will not guess about unverified writes. Completed writes are preserved in action receipts/checkpoints and must not be replayed automatically.",
        "## Next best action\nThis stop requires attention before another automatic slice can safely run. Completed writes and checkpoints are preserved.",
      ].join("\n\n");

      await ctx.runMutation(internal.jobs.finalizeInterruptedJob, {
        jobId: job.jobId,
        status: timedOut ? "timed_out" : "failed",
        resultText,
        stopReason,
        diagnosticsJson: JSON.stringify({
          runId: job.jobId,
          stopReason,
          finalOperation: message,
          provider: "OpenAI",
          model: job.model || null,
          runnerResponseReturned: false,
        }),
        completedAt: Date.now(),
      });
    }
  },
});

// A single-use claim fences duplicate deliveries before any model or tool call.
export const controlJob = internalMutation({
  args: { jobId: v.string(), claim: v.optional(v.boolean()) },
  handler: async (ctx, { jobId, claim }) => {
    const row = await ctx.db.query("aiJobs").withIndex("by_jobId", q => q.eq("jobId", jobId)).unique();
    if (!row) return { status: "missing" };
    const reason = expiryReason(row, Date.now());
    if (reason) {
      await ctx.db.patch(row._id, { status: "timed_out", error: reason, updatedAt: Date.now(), completedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, { projectId: row.projectId, threadId: row.threadId });
      return { status: "timed_out" };
    }
    if (row.status !== "running") return { status: row.status };
    if (claim && row.runnerClaimed) return { status: "duplicate" };
    if (!claim && !row.runnerClaimed) return { status: "unclaimed" };
    await ctx.db.patch(row._id, { runnerClaimed: true, updatedAt: Date.now() });
    return { status: "running", deadlineAt: row.deadlineAt || (row.startedAt || row.updatedAt) + RUN_LIMIT_MS };
  },
});

export const reconcileJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Bounded batches; subsequent watchdog ticks drain a large legacy backlog.
    // Any stale queue/run we terminalize can have newer explicit work behind it,
    // so wake each affected thread after removing the barrier.
    const wake = new Map();
    const now = Date.now();
    for (const status of ["queued", "running"]) {
      const rows = await ctx.db.query("aiJobs").withIndex("by_status", q => q.eq("status", status)).take(50);
      for (const row of rows) {
        const reason = expiryReason(row, now);
        if (!reason) continue;
        await ctx.db.patch(row._id, {
          status: "timed_out",
          error: reason,
          stopReason: reason,
          completedAt: now,
          updatedAt: now,
        });
        wake.set(`${row.projectId}\n${row.threadId}`, { projectId: row.projectId, threadId: row.threadId });
      }
    }
    for (const thread of wake.values()) {
      await ctx.scheduler.runAfter(0, internal.jobs.processThread, thread);
    }
  },
});
