// Record the reminder outcome in Convex. The reminderKey (loan + date) makes
// the write-back idempotent, so n8n retries and re-runs never duplicate.
// Runs once per item; a failed email arrives here with an `error` field
// because the email node continues on error.
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_N8N_TO_CONVEX;
if (!SECRET) throw new Error('HMAC_SECRET_N8N_TO_CONVEX is not set on the n8n container');

const loan = $('Compose reminder').item.json;
const failed = Boolean($input.item.json.error);
const payload = {
  loanId: loan.loanId,
  reminderKey: loan.reminderKey,
  outcome: failed ? 'failed' : 'sent',
};
if (failed) payload.detail = 'email provider error';

const body = JSON.stringify(payload);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature =
  'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');

return { json: { body, timestamp, signature, outcome: payload.outcome } };
