import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { firstName, isAdmin, requireViewer } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { todayUtc } from "./lib/dates";
import { fail } from "./lib/errors";
import { loansForTool } from "./model/loans";
import {
  activeTools,
  assertUsableImage,
  availabilityOf,
  cleanToolInput,
  imageUrl,
  loadActiveTool,
} from "./model/tools";
import { enqueueLoanEvent } from "./notifications";
import { category, condition } from "./schema";

// Public tool API. Rules and helpers live in ./model/tools.

/**
 * Public, unauthenticated. Returns ONLY name and category of tools that are
 * available right now: no ids, owner, description, photo or dates.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await activeTools(ctx);
    const states = await Promise.all(tools.map((t) => availabilityOf(ctx, t._id, today)));
    return tools
      .filter((_, i) => states[i].state === "available")
      .map((t) => ({ name: t.name, category: t.category }));
  },
});

/** Signed-in browse view: every listing with availability. */
export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const today = todayUtc();
    const tools = await activeTools(ctx, args.category);
    return await Promise.all(
      tools.map(async (t) => {
        const [owner, availability, image] = await Promise.all([
          ctx.db.get(t.ownerId),
          availabilityOf(ctx, t._id, today),
          imageUrl(ctx, t),
        ]);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          imageUrl: image,
          // Minimal owner info: first name and the trust badge, never email.
          ownerFirstName: owner ? firstName(owner.name) : "Neighbour",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: t.ownerId === viewer._id,
          availability,
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const today = todayUtc();
    const tools = (
      await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
        .order("desc")
        .collect()
    ).filter((t) => t.removedAt === undefined);
    return await Promise.all(
      tools.map(async (t) => {
        const [pending, availability, image] = await Promise.all([
          loansForTool(ctx, t._id, "pending"),
          availabilityOf(ctx, t._id, today),
          imageUrl(ctx, t),
        ]);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          imageId: t.imageId ?? null,
          imageUrl: image,
          pendingRequests: pending.length,
          availability,
        };
      }),
    );
  },
});

/** Short-lived URL the browser uploads a listing photo to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string(), imageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const { name, description } = cleanToolInput(args);
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();
    if (existing.filter((t) => t.removedAt === undefined).length >= LIMITS.maxListingsPerUser) {
      fail("LIMIT_REACHED", `You can have at most ${LIMITS.maxListingsPerUser} listings.`);
    }
    if (args.imageId) await assertUsableImage(ctx, args.imageId);
    return await ctx.db.insert("tools", {
      ownerId: viewer._id,
      name,
      category: args.category,
      condition: args.condition,
      description,
      imageId: args.imageId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Owners only. Admins moderate by removing, not by editing others' text.
 * `imageId`: omit to keep the photo, null to remove it, an id to replace it.
 */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    imageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const tool = await loadActiveTool(ctx, args.toolId);
    if (tool.ownerId !== viewer._id) fail("FORBIDDEN", "You can only edit your own listings.");
    const { name, description } = cleanToolInput(args);

    const imageChanged = args.imageId !== undefined && args.imageId !== (tool.imageId ?? null);
    if (imageChanged && args.imageId) await assertUsableImage(ctx, args.imageId, tool._id);

    await ctx.db.patch(tool._id, {
      name,
      description,
      category: args.category,
      condition: args.condition,
      ...(imageChanged ? { imageId: args.imageId ?? undefined } : {}),
      updatedAt: Date.now(),
    });
    // Don't keep files nobody can see.
    if (imageChanged && tool.imageId) await ctx.storage.delete(tool.imageId);
  },
});

/**
 * Owner removes their own listing; admin can remove any. Soft delete so loan
 * history survives; the photo is deleted. Pending requests are declined (and
 * the borrowers told); an active loan stays visible so it can be returned.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const viewer = await requireViewer(ctx);
    const tool = await loadActiveTool(ctx, toolId);
    if (tool.ownerId !== viewer._id && !isAdmin(viewer)) {
      fail("FORBIDDEN", "You can only remove your own listings.");
    }
    const now = Date.now();
    await ctx.db.patch(toolId, { removedAt: now, removedBy: viewer._id, imageId: undefined });
    if (tool.imageId) await ctx.storage.delete(tool.imageId);

    for (const loan of await loansForTool(ctx, toolId, "pending")) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
      await enqueueLoanEvent(ctx, loan._id, "request.declined", "listing removed");
    }
  },
});
