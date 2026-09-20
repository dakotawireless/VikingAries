import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sharedState").collect();
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      deleted: Boolean(row.deleted),
      updatedAt: row.updatedAt,
    }));
  },
});

export const upsertState = internalMutation({
  args: {
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sharedState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      if (args.updatedAt < existing.updatedAt) {
        return { applied: false, updatedAt: existing.updatedAt };
      }
      await ctx.db.patch(existing._id, {
        value: args.value,
        deleted: false,
        updatedAt: args.updatedAt,
      });
      return { applied: true, updatedAt: args.updatedAt };
    }

    await ctx.db.insert("sharedState", {
      key: args.key,
      value: args.value,
      deleted: false,
      updatedAt: args.updatedAt,
    });
    return { applied: true, updatedAt: args.updatedAt };
  },
});

export const deleteState = internalMutation({
  args: {
    key: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sharedState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      if (args.updatedAt < existing.updatedAt) {
        return { applied: false, updatedAt: existing.updatedAt };
      }
      await ctx.db.patch(existing._id, {
        value: "",
        deleted: true,
        updatedAt: args.updatedAt,
      });
      return { applied: true, updatedAt: args.updatedAt };
    }

    await ctx.db.insert("sharedState", {
      key: args.key,
      value: "",
      deleted: true,
      updatedAt: args.updatedAt,
    });
    return { applied: true, updatedAt: args.updatedAt };
  },
});
