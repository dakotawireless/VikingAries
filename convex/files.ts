import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const createProjectFile = internalMutation({
  args: {
    projectId: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
  },
  handler: async (ctx, args) => ctx.db.insert("projectFiles", args),
});

export const listProjectFiles = internalQuery({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) =>
    ctx.db
      .query("projectFiles")
      .withIndex("by_project_uploadedAt", (q) => q.eq("projectId", projectId))
      .order("desc")
      .collect(),
});

export const getProjectFile = internalQuery({
  args: { id: v.id("projectFiles") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const deleteProjectFile = internalMutation({
  args: { id: v.id("projectFiles") },
  handler: async (ctx, { id }) => {
    const file = await ctx.db.get(id);
    if (file) await ctx.db.delete(id);
    return file;
  },
});
