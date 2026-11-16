import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const role = v.union(v.literal("user"), v.literal("admin"));

export const category = v.union(
  v.literal("Power tools"),
  v.literal("Hand tools"),
  v.literal("Garden"),
  v.literal("Ladders & access"),
  v.literal("Cleaning"),
  v.literal("Kitchen"),
  v.literal("Camping & outdoors"),
  v.literal("Other"),
);

export const condition = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const loanEventType = v.union(
  v.literal("request.created"),
  v.literal("request.approved"),
  v.literal("request.declined"),
  v.literal("request.cancelled"),
  v.literal("loan.returned"),
);

export const automationKind = v.union(
  v.literal("notification_handed_off"), // n8n accepted the webhook (2xx)
  v.literal("notification_delivered"), // n8n confirmed the message went out
  v.literal("notification_failed"), // Convex gave up after max retries
  v.literal("reminder_sent"),
  v.literal("reminder_failed"),
);

export default defineSchema({
  users: defineTable({
    // Clerk subject, scoped to the issuer. Never shown in the UI.
    tokenIdentifier: v.string(),
    name: v.string(),
    // Only used to address notifications and shown to the other party of an
    // approved loan. Never returned by public queries.
    email: v.optional(v.string()),
    role,
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    // Optional photo in Convex file storage. Only signed-in users see it;
    // the public page shows a category illustration instead.
    imageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
    // Soft delete keeps loan history intact.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_removed_category", ["removedAt", "category"])
    .index("by_image", ["imageId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // Calendar dates as YYYY-MM-DD, interpreted in UTC.
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status_end", ["status", "endDate"]),

  // Transactional outbox: a row is written in the same mutation as the state
  // change, then delivered to n8n by a scheduled action with retries.
  outbox: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    type: loanEventType,
    payload: v.string(), // exact JSON body that gets signed and sent
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),

  // Per-loan automation history (the "Reminder sent 2 days ago" line).
  // idempotencyKey is unique, so n8n retries never create duplicates.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: automationKind,
    idempotencyKey: v.string(),
    detail: v.string(),
    at: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Failures reported by the n8n error workflow, visible to admins.
  workflowErrors: defineTable({
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.string(),
    message: v.string(),
    at: v.number(),
  }).index("by_execution", ["executionId"]),
});
