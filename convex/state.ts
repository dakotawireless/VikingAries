import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const listState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sharedState").collect();
    return rows.map((row) => ({
      key: row.key,
      value: row.value,
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
        updatedAt: args.updatedAt,
      });
      return { applied: true, updatedAt: args.updatedAt };
    }

    await ctx.db.insert("sharedState", args);
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

    if (!existing) return { applied: true, updatedAt: args.updatedAt };
    if (args.updatedAt < existing.updatedAt) {
      return { applied: false, updatedAt: existing.updatedAt };
    }

    await ctx.db.delete(existing._id);
    return { applied: true, updatedAt: args.updatedAt };
  },
});
