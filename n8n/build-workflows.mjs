// Builds n8n/workflows/*.json from the Code-node sources in n8n/code/.
// Keeping the JavaScript in real .js files makes it reviewable and lintable;
// the JSON is what n8n imports. Run: node n8n/build-workflows.mjs
//
// No secrets appear here or in the output: Code nodes read them from the
// container environment ($env), and no credentials are referenced.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const code = (name) => readFileSync(join(here, "code", `${name}.js`), "utf8");

// Deterministic ids so re-running the build gives a stable diff.
const uuid = (seed) => {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const IDS = {
  error: "LLerrorHandler01",
  notify: "LLrequestNotify1",
  overdue: "LLoverdueRemind1",
};

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };

const node = (wf, name, type, typeVersion, position, parameters, extra = {}) => ({
  id: uuid(`${wf}:${name}`),
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});

const codeNode = (wf, name, file, position, mode = "runOnceForAllItems") =>
  node(wf, name, "n8n-nodes-base.code", 2, position, { mode, jsCode: code(file) });

const signedPost = (wf, name, path, position) =>
  node(
    wf,
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: `={{ $env.LENDLOOP_CONVEX_SITE_URL }}${path}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "x-lendloop-timestamp", value: "={{ $json.timestamp }}" },
          { name: "x-lendloop-signature", value: "={{ $json.signature }}" },
        ],
      },
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/json",
      body: "={{ $json.body }}",
      options: {
        timeout: 10000,
        response: { response: { fullResponse: true, responseFormat: "text" } },
      },
    },
    RETRY,
  );

const sendMail = (wf, name, position, extra = {}) =>
  node(
    wf,
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      // Mailpit's send API stands in for a real email provider locally.
      url: "={{ $env.LENDLOOP_MAIL_API_URL }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.mail) }}",
      options: { timeout: 10000 },
    },
    { ...RETRY, ...extra },
  );

const ifNode = (wf, name, position, left, right) =>
  node(wf, name, "n8n-nodes-base.if", 2.2, position, {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [
        {
          id: uuid(`${wf}:${name}:cond`),
          leftValue: left,
          rightValue: right,
          operator: { type: "string", operation: "equals" },
        },
      ],
      combinator: "and",
    },
    options: {},
  });

const respond = (wf, name, position, code, body) =>
  node(wf, name, "n8n-nodes-base.respondToWebhook", 1.1, position, {
    respondWith: "json",
    responseBody: JSON.stringify(body),
    options: { responseCode: code },
  });

const link = (from, to, output = 0) => ({ from, to, output });

function connections(links) {
  const out = {};
  for (const { from, to, output } of links) {
    out[from] ??= { main: [] };
    while (out[from].main.length <= output) out[from].main.push([]);
    out[from].main[output].push({ node: to, type: "main", index: 0 });
  }
  return out;
}

const workflow = (id, name, nodes, links, settings = {}) => ({
  id,
  name,
  active: true,
  nodes,
  connections: connections(links),
  settings: { executionOrder: "v1", saveManualExecutions: true, ...settings },
  pinData: {},
  meta: { templateCredsSetupCompleted: true },
  tags: [],
});

// ---------- 1. Request notifications (Convex -> n8n webhook) ----------
const N = "notify";
const notify = workflow(
  IDS.notify,
  "LendLoop · Request notifications",
  [
    node(N, "Convex event webhook", "n8n-nodes-base.webhook", 2, [0, 300], {
      httpMethod: "POST",
      path: "lendloop-request-events",
      responseMode: "responseNode",
      options: { rawBody: true },
    }, { webhookId: uuid("notify:webhook") }),
    codeNode(N, "Verify signature", "verify-request-event", [220, 300]),
    ifNode(N, "Signature valid?", [440, 300], "={{ $json.verdict === 'invalid' ? 'no' : 'yes' }}", "yes"),
    respond(N, "Reject (401)", [660, 480], 401, { error: "invalid signature" }),
    ifNode(N, "New event?", [660, 200], "={{ $json.verdict }}", "ok"),
    respond(N, "Already handled (200)", [880, 360], 200, { status: "duplicate" }),
    respond(N, "Accept (202)", [880, 120], 202, { status: "accepted" }),
    codeNode(N, "Compose email", "compose-request-email", [1100, 120]),
    sendMail(N, "Send email", [1320, 120]),
    codeNode(N, "Sign delivery receipt", "sign-delivery-receipt", [1540, 120]),
    signedPost(N, "Report delivery to Convex", "/automation/notification-status", [1760, 120]),
  ],
  [
    link("Convex event webhook", "Verify signature"),
    link("Verify signature", "Signature valid?"),
    link("Signature valid?", "New event?", 0),
    link("Signature valid?", "Reject (401)", 1),
    link("New event?", "Accept (202)", 0),
    link("New event?", "Already handled (200)", 1),
    link("Accept (202)", "Compose email"),
    link("Compose email", "Send email"),
    link("Send email", "Sign delivery receipt"),
    link("Sign delivery receipt", "Report delivery to Convex"),
  ],
  { errorWorkflow: IDS.error },
);

// ---------- 2. Daily overdue reminders (n8n -> Convex) ----------
const O = "overdue";
const overdue = workflow(
  IDS.overdue,
  "LendLoop · Daily overdue reminders",
  [
    node(O, "Every day 08:00 UTC", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300], {
      rule: { interval: [{ field: "cronExpression", expression: "0 8 * * *" }] },
    }),
    // Lets you run it now: `n8n execute --id=LLoverdueRemind1`, or from
    // another workflow. In the editor, "Execute workflow" works too.
    node(O, "Run on demand", "n8n-nodes-base.executeWorkflowTrigger", 1.1, [0, 480], {
      inputSource: "passthrough",
    }),
    codeNode(O, "Sign fetch request", "sign-overdue-fetch", [220, 300]),
    signedPost(O, "Fetch overdue loans", "/automation/overdue-loans", [440, 300]),
    codeNode(O, "Verify response", "verify-overdue-response", [660, 300]),
    codeNode(O, "Compose reminder", "compose-reminder", [880, 300], "runOnceForEachItem"),
    // continueRegularOutput: a failed email still reaches the write-back
    // (with an `error` field) so Convex records "reminder failed".
    sendMail(O, "Email borrower", [1100, 300], { onError: "continueRegularOutput" }),
    codeNode(O, "Sign reminder status", "sign-reminder-status", [1320, 300], "runOnceForEachItem"),
    signedPost(O, "Write status to Convex", "/automation/reminder-status", [1540, 300]),
  ],
  [
    link("Every day 08:00 UTC", "Sign fetch request"),
    link("Run on demand", "Sign fetch request"),
    link("Sign fetch request", "Fetch overdue loans"),
    link("Fetch overdue loans", "Verify response"),
    link("Verify response", "Compose reminder"),
    link("Compose reminder", "Email borrower"),
    link("Email borrower", "Sign reminder status"),
    link("Sign reminder status", "Write status to Convex"),
  ],
  { errorWorkflow: IDS.error, timezone: "UTC" },
);

// ---------- 3. Error handler ----------
const E = "error";
const errorWf = workflow(
  IDS.error,
  "LendLoop · Error handler",
  [
    node(E, "On workflow error", "n8n-nodes-base.errorTrigger", 1, [0, 300], {}),
    codeNode(E, "Summarise error", "summarise-error", [220, 300]),
    sendMail(E, "Alert ops by email", [440, 200]),
    signedPost(E, "Report to Convex", "/automation/workflow-error", [440, 400]),
  ],
  [
    link("On workflow error", "Summarise error"),
    link("Summarise error", "Alert ops by email"),
    link("Summarise error", "Report to Convex"),
  ],
);
// n8n 2.x only runs an error workflow that is published, like any other.

for (const [file, wf] of [
  ["error-handler.json", errorWf],
  ["request-notifications.json", notify],
  ["overdue-reminders.json", overdue],
]) {
  writeFileSync(join(here, "workflows", file), JSON.stringify(wf, null, 2) + "\n");
  console.log(`wrote n8n/workflows/${file}`);
}
