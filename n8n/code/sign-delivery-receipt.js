// Tell Convex the email went out. Signed with the n8n -> Convex secret;
// Convex de-duplicates on eventId, so retries are safe.
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_N8N_TO_CONVEX;
if (!SECRET) throw new Error('HMAC_SECRET_N8N_TO_CONVEX is not set on the n8n container');

const eventId = $('Compose email').first().json.eventId;
const body = JSON.stringify({ eventId });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature =
  'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');

return [{ json: { body, timestamp, signature } }];
