// Error workflow: keep only what an operator needs (no item data, which
// could contain personal details), sign it for Convex, and build an alert.
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_N8N_TO_CONVEX;

const e = $input.first().json;
const summary = {
  executionId: String((e.execution && e.execution.id) || (e.trigger && 'trigger') || 'unknown'),
  workflowName: (e.workflow && e.workflow.name) || 'unknown workflow',
  nodeName: (e.execution && e.execution.lastNodeExecuted) || 'unknown node',
  message: String((e.execution && e.execution.error && e.execution.error.message) ||
    (e.trigger && e.trigger.error && e.trigger.error.message) || 'unknown error').slice(0, 300),
};

const body = JSON.stringify(summary);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = SECRET
  ? 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')
  : '';

return [
  {
    json: {
      body,
      timestamp,
      signature,
      mail: {
        From: { Email: $env.LENDLOOP_MAIL_FROM || 'notifications@lendloop.local', Name: 'LendLoop automation' },
        To: [{ Email: $env.LENDLOOP_OPS_EMAIL || 'ops@lendloop.local', Name: 'LendLoop ops' }],
        Subject: `[LendLoop] ${summary.workflowName} failed at "${summary.nodeName}"`,
        Text:
          `${summary.message}\n\nExecution: ${summary.executionId}\n` +
          `Open n8n to inspect and retry: ${$env.N8N_EDITOR_BASE_URL || 'http://localhost:5678'}`,
        Tags: ['lendloop', 'workflow-error'],
      },
    },
  },
];
