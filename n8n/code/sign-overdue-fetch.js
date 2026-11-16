// Sign the request for the overdue-loan list (n8n -> Convex secret).
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_N8N_TO_CONVEX;
if (!SECRET) throw new Error('HMAC_SECRET_N8N_TO_CONVEX is not set on the n8n container');

const body = JSON.stringify({ requestedAt: new Date().toISOString() });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature =
  'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');

return [{ json: { body, timestamp, signature } }];
