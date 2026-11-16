// Convex signs the overdue list with the Convex -> n8n secret. Verify it
// before emailing anyone, then emit one item per overdue loan.
const crypto = require('crypto');
const SECRET = $env.HMAC_SECRET_CONVEX_TO_N8N;
const MAX_SKEW_SECONDS = 300;
if (!SECRET) throw new Error('HMAC_SECRET_CONVEX_TO_N8N is not set on the n8n container');

const res = $input.first().json;
const headers = res.headers || {};
// With responseFormat "text" the HTTP node puts the exact body in `data`.
const raw = res.data;
if (typeof raw !== 'string') throw new Error('Expected the raw response body as text');
const timestamp = headers['x-lendloop-timestamp'];
const signature = String(headers['x-lendloop-signature'] || '');

if (!timestamp || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) {
  throw new Error('Overdue list response has a missing or stale timestamp');
}
const expected =
  'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${raw}`).digest('hex');
const a = Buffer.from(expected);
const b = Buffer.from(signature);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw new Error('Overdue list response failed signature verification');
}

const { loans } = JSON.parse(raw);
return loans.map((loan) => ({ json: loan }));
