import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { IMAGE_TYPES, LIMITS } from "../lib/constants";
import { fail } from "../lib/errors";
import { loansForTool } from "./loans";

// Tool business rules shared by the public functions in convex/tools.ts.

type Range = { startDate: string; endDate: string };
export type Availability =
  | { state: "available"; booked: Range[] }
  | { state: "on_loan"; until: string; overdue: boolean; booked: Range[] };

const MAX_BOOKED_SHOWN = 3;

export async function availabilityOf(ctx: QueryCtx, toolId: Id<"tools">, today: string): Promise<Availability> {
  const approved = await loansForTool(ctx, toolId, "approved");
  // Upcoming approved ranges, so borrowers can pick free dates up front
  // instead of discovering a clash on submit.
  const booked = approved
    .filter((l) => l.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, MAX_BOOKED_SHOWN)
    .map(({ startDate, endDate }) => ({ startDate, endDate }));
  const current = approved.find((l) => l.startDate <= today);
  if (current) {
    return { state: "on_loan", until: current.endDate, overdue: current.endDate < today, booked };
  }
  return { state: "available", booked };
}

export async function activeTools(ctx: QueryCtx, cat?: Doc<"tools">["category"]) {
  return await ctx.db
    .query("tools")
    .withIndex("by_removed_category", (q) =>
      cat ? q.eq("removedAt", undefined).eq("category", cat) : q.eq("removedAt", undefined),
    )
    .order("desc")
    .take(200);
}

/** Load an active listing; NOT_FOUND if missing or removed. */
export async function loadActiveTool(ctx: MutationCtx, toolId: Id<"tools">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "Listing not found.");
  return tool;
}

export function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > LIMITS.toolName) {
    fail("INVALID_INPUT", `Name must be 2–${LIMITS.toolName} characters.`);
  }
  if (description.length > LIMITS.toolDescription) {
    fail("INVALID_INPUT", `Description must be at most ${LIMITS.toolDescription} characters.`);
  }
  return { name, description };
}

/**
 * Check an uploaded file before attaching it to a listing. The browser's
 * claims don't count: type and size come from Convex's own storage
 * metadata. A rejected file is deleted straight away. A file already used
 * by another listing can't be attached, so ids can't be borrowed.
 */
export async function assertUsableImage(ctx: MutationCtx, storageId: Id<"_storage">, forTool?: Id<"tools">) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) fail("INVALID_INPUT", "That photo upload has expired. Please try again.");
  const type = meta.contentType ?? "";
  if (!(IMAGE_TYPES as readonly string[]).includes(type) || meta.size > LIMITS.imageMaxBytes) {
    await ctx.storage.delete(storageId);
    fail("INVALID_INPUT", "Photos must be JPEG, PNG or WebP and at most 5 MB.");
  }
  const user = await ctx.db.query("tools").withIndex("by_image", (q) => q.eq("imageId", storageId)).first();
  if (user && user._id !== forTool) fail("FORBIDDEN", "That photo belongs to another listing.");
}

export async function imageUrl(ctx: QueryCtx, tool: Doc<"tools">) {
  return tool.imageId ? await ctx.storage.getUrl(tool.imageId) : null;
}
