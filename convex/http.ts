import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signBody, verifySignature } from "./lib/hmac";

// Endpoints called by n8n. Every request must carry a valid HMAC signature
// made with HMAC_SECRET_N8N_TO_CONVEX. Responses that carry data are signed
// with HMAC_SECRET_CONVEX_TO_N8N so n8n can verify them too.
//
// All endpoints are POST so the timestamp + body are covered by the
// signature (a signed GET would need path/query canonicalisation).

const http = httpRouter();

const MAX_BODY_BYTES = 16 * 1024;

type Handler = (ctx: ActionCtx, body: unknown) => Promise<unknown>;

function json(status: number, data: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function signedEndpoint(handler: Handler) {
  return httpAction(async (ctx, request) => {
    const inSecret = process.env.HMAC_SECRET_N8N_TO_CONVEX;
    const outSecret = process.env.HMAC_SECRET_CONVEX_TO_N8N;
    if (!inSecret || !outSecret) {
      console.error("HMAC secrets are not configured on the Convex deployment");
      return json(503, { error: "automation endpoints not configured" });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "payload too large" });

    const check = await verifySignature(
      inSecret,
      raw,
      request.headers.get(TIMESTAMP_HEADER),
      request.headers.get(SIGNATURE_HEADER),
    );
    if (!check.ok) {
      // Log the reason server-side; give the caller nothing to tune against.
      console.warn(`Rejected automation call: ${check.reason}`);
      return json(401, { error: "invalid signature" });
    }

    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(400, { error: "body must be JSON" });
    }

    try {
      const result = await handler(ctx, body);
      const out = JSON.stringify(result);
      return new Response(out, {
        status: 200,
        headers: { "content-type": "application/json", ...(await signBody(outSecret, out)) },
      });
    } catch (e) {
      // Validation errors (bad ids, wrong shapes) are the caller's fault: 400
      // so n8n doesn't retry them forever. Anything else is a 500 to retry.
      const message = e instanceof Error ? e.message : String(e);
      const isClientError =
        e instanceof ConvexError || /ArgumentValidationError|Validator|not match/i.test(message);
      console.error(`Automation handler failed: ${message}`);
      return json(isClientError ? 400 : 500, {
        error: isClientError ? "invalid request" : "internal error",
      });
    }
  });
}

const asRecord = (b: unknown) => (b && typeof b === "object" ? (b as Record<string, unknown>) : {});

http.route({
  path: "/automation/overdue-loans",
  method: "POST",
  handler: signedEndpoint((ctx) => ctx.runQuery(internal.automation.overdueLoans, {})),
});

http.route({
  path: "/automation/reminder-status",
  method: "POST",
  handler: signedEndpoint((ctx, body) => {
    const b = asRecord(body);
    return ctx.runMutation(internal.automation.recordReminder, {
      loanId: b.loanId as never, // validated by the mutation's v.id("loans")
      reminderKey: b.reminderKey as string,
      outcome: b.outcome as "sent" | "failed",
      ...(typeof b.detail === "string" ? { detail: b.detail } : {}),
    });
  }),
});

http.route({
  path: "/automation/notification-status",
  method: "POST",
  handler: signedEndpoint((ctx, body) =>
    ctx.runMutation(internal.automation.recordNotificationDelivered, {
      eventId: asRecord(body).eventId as string,
    }),
  ),
});

http.route({
  path: "/automation/workflow-error",
  method: "POST",
  handler: signedEndpoint((ctx, body) => {
    const b = asRecord(body);
    return ctx.runMutation(internal.automation.recordWorkflowError, {
      executionId: String(b.executionId ?? "unknown"),
      workflowName: String(b.workflowName ?? "unknown"),
      nodeName: String(b.nodeName ?? "unknown"),
      message: String(b.message ?? "no message"),
    });
  }),
});

export default http;
