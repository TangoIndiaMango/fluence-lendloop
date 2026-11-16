// Verify the HMAC signature Convex puts on every request-status event,
// reject stale timestamps, and drop events this workflow already handled.
// Secret comes from the container env, never from the workflow JSON.
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_CONVEX_TO_N8N;
const MAX_SKEW_SECONDS = 300;

if (!SECRET) throw new Error('HMAC_SECRET_CONVEX_TO_N8N is not set on the n8n container');

const item = $input.first();
const headers = item.json.headers || {};

// The signature covers the exact bytes Convex sent, so read the raw body.
let raw;
if (item.binary && item.binary.data) {
  raw = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
} else {
  raw = JSON.stringify(item.json.body ?? {});
}

const result = (verdict, reason, event) => [{ json: { verdict, reason, event } }];

const timestamp = headers['x-lendloop-timestamp'];
const signature = String(headers['x-lendloop-signature'] || '');
const now = Math.floor(Date.now() / 1000);
if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now - Number(timestamp)) > MAX_SKEW_SECONDS) {
  return result('invalid', 'missing or stale timestamp');
}

const expected =
  'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${raw}`).digest('hex');
const a = Buffer.from(expected);
const b = Buffer.from(signature);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  return result('invalid', 'signature mismatch');
}

let event;
try {
  event = JSON.parse(raw);
} catch {
  return result('invalid', 'body is not JSON');
}
if (!event.eventId || !event.recipient || !event.recipient.email) {
  return result('invalid', 'missing required fields');
}

// Convex retries if our 2xx gets lost; remember recent event ids so a retry
// never sends a second email.
const store = $getWorkflowStaticData('global');
store.seenEventIds = store.seenEventIds || [];
if (store.seenEventIds.includes(event.eventId)) {
  return result('duplicate', 'already processed', { eventId: event.eventId });
}
store.seenEventIds.push(event.eventId);
if (store.seenEventIds.length > 500) store.seenEventIds = store.seenEventIds.slice(-500);

return result('ok', null, event);
