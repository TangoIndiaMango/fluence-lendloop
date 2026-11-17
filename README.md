# LendLoop

A neighbourhood tool-lending board. List the drill gathering dust in your shed, borrow a ladder for the weekend, give it back when you're done.

Built for the Fluence International take-home with **Next.js (App Router) + TypeScript**, **Clerk** for auth, **Convex** for data and backend logic, and **n8n** (in Docker) for notifications and reminders.

- [What it does](#what-it-does)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [Architecture](#architecture)
- [Security and data minimisation](#security-and-data-minimisation)
- [Reliability and error handling](#reliability-and-error-handling)
- [What I'd change for production](#what-id-change-for-production)

## What it does

**Public page (`/`)**: name, tagline, and a read-only list of tools that are free right now. The query behind it returns only `{ name, category }`: no owner, no description, no ids, no dates. A "Sign in to lend or borrow" button opens Clerk.

**Signed in**

| View | What you can do |
| --- | --- |
| All tools (`/browse`) | Every listing with live availability ("Available", "Out until 21 Nov", "Overdue") and a category filter. Request a date range with an optional note. |
| My listings (`/listings`) | List a tool (name, category, condition, short description), edit it, or remove it. |
| My requests (`/requests`) | Track what you asked to borrow, withdraw pending requests, and see the lender's email once approved. |
| Incoming (`/incoming`) | Approve or decline requests for your tools; mark a loan returned. Grouped into *Waiting for you*, *Out on loan* and *History*. |
| Admin (`/admin`) | Admins only: automation health, Trusted Lender toggles, and every loan. Admins can also remove any listing from *All tools*. |

Each loan shows its **latest automation activity**, for example *"Overdue reminder sent to borrower · 2 days ago"*, *"Lender notified of new request · 5 minutes ago"* or *"Notification retrying (attempt 3)"*.

## Run it locally

Prerequisites: Node 20+, pnpm, Docker, a free Clerk account. Convex can run fully locally without an account.

```bash
pnpm install
```

**1. Clerk.** Create an application in the Clerk dashboard, then:

- Copy the publishable and secret keys into `.env.local` (see `.env.example`).
- Turn on the **Convex integration** (Dashboard → Integrations → Convex), or create a JWT template named `convex`.
- Add `email` and `name` to the session token (Configure → Sessions → Customize session token). The integration doesn't include them by default, and without them nobody gets notification emails and `users:setRole` can't find you:

  ```json
  { "name": "{{user.full_name}}", "email": "{{user.primary_email_address}}" }
  ```
- Note the **Frontend API URL** (`https://<something>.clerk.accounts.dev`).

**2. Convex.** In one terminal:

```bash
npx convex dev
```

The first run asks you to log in or to run locally without an account, and writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local`. Then tell Convex which Clerk instance to trust:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
```

**3. n8n + Mailpit.** Generate secrets and start the stack:

```bash
./scripts/generate-secrets.sh
```

```bash
docker compose up -d
```

The script writes `.env` with a fresh n8n encryption key and two HMAC secrets, then prints three `npx convex env set ...` commands. Run them so Convex shares the same secrets and knows the webhook URL.

`docker compose up` imports and publishes the three workflows from `n8n/workflows/` automatically.

- n8n editor: http://localhost:5678 (create the owner account on first visit)
- Mailpit inbox (every email LendLoop sends lands here): http://localhost:8025

**4. The app.**

```bash
pnpm dev
```

Open http://localhost:3000 and sign in.

**Make yourself admin** (internal function, so the browser can't call it):

```bash
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

**Demo data (optional).** Adds three neighbours, five tools, a pending request (fires a notification) and an overdue loan (for the reminder workflow):

```bash
npx convex run seed:demo
```

**Try the overdue workflow now** instead of waiting for 08:00 UTC: open it in n8n and click *Execute workflow*, or run

```bash
docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 n8n n8n execute --id=LLoverdueRemind1
```

**Check the signed endpoints:**

```bash
node --env-file=.env --env-file=.env.local scripts/check-endpoints.mjs
```

It checks that unsigned, forged and stale calls are rejected, that a valid call works and its response signature verifies, and that a repeated write-back is a no-op.

## Environment variables

`.env.example` lists every variable, grouped by who reads it.

| Variable | Where it lives | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | `.env.local` (written by `npx convex dev`) | Convex client URL / deployment name |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local` | Clerk |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env | Issuer Convex trusts for JWTs |
| `N8N_REQUEST_WEBHOOK_URL` | Convex env | n8n production webhook for request events |
| `HMAC_SECRET_CONVEX_TO_N8N` | Convex env **and** `.env` | Convex signs webhooks and data responses; n8n verifies |
| `HMAC_SECRET_N8N_TO_CONVEX` | Convex env **and** `.env` | n8n signs every call to Convex; Convex verifies |
| `N8N_ENCRYPTION_KEY` | `.env` | Encrypts n8n's stored credentials |
| `LENDLOOP_CONVEX_SITE_URL` | `.env` | Convex HTTP actions URL as seen from the n8n container |
| `LENDLOOP_APP_URL`, `LENDLOOP_MAIL_API_URL`, `LENDLOOP_MAIL_FROM`, `LENDLOOP_OPS_EMAIL` | `.env` | Links in emails, mail API, sender, ops alert inbox |
| `N8N_PUBLIC_WEBHOOK_BASE` | `.env` (optional) | Public URL for n8n when Convex runs in the cloud (see below) |

> **Cloud Convex + local n8n:** a cloud deployment can't reach `localhost:5678`. Expose n8n with a tunnel (`cloudflared tunnel --url http://localhost:5678`), set `N8N_PUBLIC_WEBHOOK_BASE` to it, and point `N8N_REQUEST_WEBHOOK_URL` at `<tunnel>/webhook/lendloop-request-events`. Set `LENDLOOP_CONVEX_SITE_URL` to your `https://<deployment>.convex.site`.

## Architecture

```
            Clerk (sign-in, JWT)
                  │
  Next.js UI ──── Convex (queries / mutations) ─────────────┐
  (client         │   every function checks identity + role │
   components)    │                                         │
                  ├─ outbox row written in the same          │
                  │  transaction as the status change        │
                  │        │                                 │
                  │        ▼ scheduled action, retries       │
                  │   POST n8n webhook (HMAC signed) ──► n8n: Request notifications
                  │                                          │  verify → 202 → email → signed receipt
                  │                                          ▼
                  ├─ HTTP actions /automation/*  ◄── n8n: Daily overdue reminders
                  │   (verify HMAC, signed responses)        08:00 UTC, fetch → verify → email → write-back
                  │                                          │
                  └─ automationEvents, workflowErrors ◄── n8n: Error handler (alerts ops + reports to Convex)
```

**Convex** (`convex/`)

- `schema.ts`: `users`, `tools` (soft-deleted), `loans`, `outbox`, `automationEvents`, `workflowErrors`.
- `lib/auth.ts`: `requireViewer` / `requireAdmin`. Every public function starts with one of them.
- `lib/errors.ts`: `fail(code, message)`. Every user-facing error has one shape, `{ code, message }`, with a stable code (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `INVALID_INPUT`, `INVALID_STATE`, `LIMIT_REACHED`, …). Anything else is a bug and is redacted by Convex in production.
- `model/loans.ts`: loan business rules as plain functions that take `ctx` (`assertBookableRange`, `assertNoApprovedClash`, `loadLoanAs`, `assertStatus`, `presentLoan`).
- `tools.ts`, `loans.ts`, `users.ts`: the public API. Each function reads as authorise → check → change → notify.
- `notifications.ts`: transactional outbox and the signed delivery action with retries.
- `http.ts` + `automation.ts`: the four HMAC-protected endpoints n8n calls, backed by internal functions that the browser can't reach.
- `crons.ts`: hourly cleanup of uploaded photos no listing uses.
- `seed.ts`: demo data (internal).

**Loan lifecycle:** `pending → approved → returned`, or `pending → declined | cancelled`. Overdue is derived (approved and the end date has passed), not stored, so it can't drift. Approving re-checks for clashes and auto-declines other pending requests for overlapping dates, and their borrowers are told.

**Next.js** (`src/`)

- `components/ui/`: the design-system layer: buttons (with inline confirm instead of `window.confirm`), an accessible switch, badges, form fields, empty/loading/error states. Colours come from tokens in `globals.css`.
- `components/tools/`, `components/loans/`, `components/admin/`: feature components (cards, forms, filter bar, tables).
- `hooks/`: `useAsyncAction` (busy/error/run around any mutation, so no component writes its own try/catch), `useToolFilters` (browse filters in the URL), `useStoreUser`.
- `lib/errors.ts` turns the server's `{ code, message }` into UI text; `lib/format.ts` holds date and text helpers.
- Pages stay thin: fetch, compose components, wire actions.

**Photos:** owners upload a photo straight to Convex storage. The server checks type (JPEG, PNG or WebP) and size (5 MB) from storage metadata rather than trusting the browser, deletes replaced files (an hourly job clears rejected or abandoned uploads), and won't let one listing reuse another's file. The seeded demo tools link free [Unsplash](https://unsplash.com/license) photos from the Unsplash CDN; only `images.unsplash.com` links are accepted, and only internal functions can set them (`npx convex run seed:photos`). Listings without a photo get a category illustration. The public page shows only the illustration, so it still exposes nothing but name and category.

**Browse filters:** category is filtered in Convex through the `by_removed_category` index; text search and "available now" are applied to the loaded list. All three live in the URL (`?category=Garden&q=hedge&available=1`), so refresh, back and shared links keep them. Borrowers see upcoming booked ranges on each card, and the request form flags a clash before submitting (the server still re-checks).

**n8n** (`n8n/`)

| Workflow | Trigger | Flow |
| --- | --- | --- |
| Request notifications | Webhook from Convex | Verify HMAC and timestamp on the raw body → drop duplicate `eventId` → respond 202 → compose email → send → signed receipt to Convex (activity line) |
| Daily overdue reminders | Schedule, 08:00 UTC | Signed POST for overdue loans → verify the *response* signature → one email per loan → signed, idempotent write-back of `sent` / `failed` |
| Error handler | Error trigger (set as the error workflow of the other two) | Summarise without item data → email ops + signed report to Convex (shown on `/admin`) |

The Code-node JavaScript lives in real files in `n8n/code/`. `node n8n/build-workflows.mjs` assembles them into the importable JSON in `n8n/workflows/`, which keeps the logic reviewable and the export reproducible. Mailpit's send API stands in for an email provider; swapping in Resend, SES or SMTP only changes the two "send" nodes.

## Security and data minimisation

**Authorisation lives in Convex, not the UI.** Every public query and mutation resolves the caller from the Clerk JWT, and owner or admin checks happen inside the function. Hiding a button is only a convenience. Examples:

- Only the tool's owner can edit it. The owner or an admin can remove it.
- Only the owner can approve, decline or mark returned. Only the borrower can withdraw.
- Admin queries (`loans.all`, `users.lenders`, `automation.health`) throw for non-admins, even if someone opens `/admin` directly.
- Roles are stored in Convex and only changed through an *internal* mutation (CLI or dashboard). `users.store` never accepts a role from the client.
- "Not found" and "not yours" return the same error, so ids can't be probed.

**Data minimisation**

- The public list exposes only tool name and category for tools that are free now.
- Signed-in users see a lender's *first name* and Trusted Lender badge, never their email.
- Email addresses are shown to the other party only once a loan is **approved** (they need to arrange pick-up), and only to that party.
- Webhook payloads to n8n carry just what the message needs: event type, first names, tool name, dates and the recipient's email. No user ids, descriptions or the other party's email.
- The error workflow forwards workflow name, node and error message only, never the item data (which could contain emails). n8n prunes execution data after 7 days.

**Signing both ways (HMAC-SHA256)**

- Signed string: `${unixTimestamp}.${rawBody}`. Headers: `X-LendLoop-Timestamp` and `X-LendLoop-Signature: sha256=<hex>`.
- Receivers reject timestamps more than 5 minutes off, compare in constant time, and verify the **raw bytes** (the n8n webhook uses the raw-body option).
- Two secrets, one per direction, so each can be rotated on its own and a leak in one direction can't forge the other.
- Convex signs its *responses* too, and n8n verifies the overdue list before emailing anyone.
- All n8n → Convex calls are POSTs, so the timestamp and body are always covered by the signature.

**Secrets** live only in Convex env and the n8n container env (`.env`, git-ignored). Code nodes read them with `$env`. The exported workflow JSON contains no secrets and references no credentials; you can check with `grep -ri secret n8n/workflows`, which finds only env-variable names.

**Input validation:** Convex validators on every argument, plus server-side length limits, date checks (valid, not in the past, at most 30 days long and 90 days ahead), clash detection, and caps on open requests (10) and listings (50) per user. HTTP endpoints cap body size, return 400 for malformed input (so n8n doesn't retry it forever) and 500 for real faults. Next.js sends `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a permissions policy.

## Reliability and error handling

- **Transactional outbox.** The event row is written in the same Convex transaction as the status change, so a rolled-back mutation never notifies and a committed one always tries to.
- **Convex → n8n retries.** Up to 5 attempts with exponential backoff and jitter (≈10s, 20s, 40s, 80s) and a 10s timeout per attempt. While retrying, the loan shows *"Notification retrying (attempt N)"*. A final failure is recorded on the loan and counted on `/admin`.
- **n8n retries.** Every HTTP node retries 3 times, 5s apart.
- **Idempotency everywhere.**
  - n8n remembers the last 500 `eventId`s, so a Convex retry after a lost 2xx doesn't send a second email.
  - Delivery receipts are keyed by `eventId`.
  - Reminder write-backs are keyed by `reminder:<loanId>:<YYYY-MM-DD>`. A repeated `sent` is a no-op, and a `failed` can later be upgraded to `sent`.
  - The overdue endpoint skips loans already reminded today, so re-running the workflow is safe.
- **Partial failure.** If one reminder email fails, the rest still go out, and that loan is written back as `failed`.
- **Visible failures.** The error workflow emails ops (Mailpit locally) and posts to Convex, so admins see *"Daily overdue reminders failed at 'Fetch overdue loans'"* on `/admin` without opening n8n.

I tested all of this locally against a local Convex backend and n8n 2.47:

- Signed webhook → email → receipt.
- Overdue run → email → write-back, and a re-run that sends nothing.
- Forged and stale signatures rejected.
- Duplicate write-backs ignored.
- n8n stopped mid-delivery: Convex backed off and delivered after it came back.
- A forced verification failure triggered the error workflow, which emailed ops and logged to Convex.

## Tests

```bash
pnpm test
```

69 unit tests in `tests/convex/` run the real Convex functions against an in-memory backend ([convex-test](https://docs.convex.dev/testing/convex-test) on the edge runtime), with no services needed. They cover:

- **Roles:** only owners edit; owners or admins remove; only admins see all loans, lenders and health; others get `FORBIDDEN`, or `NOT_FOUND` where an id shouldn't be probeable.
- **Loan rules:** date validation, clashes with approved loans (inclusive end day), duplicate requests, auto-decline on approve, the status machine, overdue flags.
- **Data minimisation:** the public list is name and category only; emails appear only on approved loans, only to the other party; webhook payloads carry first names and one email.
- **Automation:** idempotent reminder and delivery write-backs, daily reminder de-duplication, retries with backoff then a recorded failure.
- **HTTP endpoints:** missing, wrong, tampered and replayed signatures are rejected; replies are signed; malformed write-backs get 400 (no retry); oversized bodies get 413.
- **Uploads:** stored file type is checked, photos can't be borrowed between listings, and the hourly cleanup removes orphans.

Writing these found one real bug: a rejected upload was deleted inside the mutation that then threw, so the rollback undid the delete. Rejected and abandoned uploads are now removed by an hourly cron (`convex/crons.ts`).

## What I'd change for production

- **Real email provider** (Resend, Postmark or SES) through an n8n credential, with SPF/DKIM and per-user notification preferences and unsubscribe.
- **Replay protection beyond the time window:** store recent signature nonces, or switch to per-request ids rejected on reuse.
- **Secret rotation:** accept two secrets per direction during a rotation window.
- **n8n hardening:** run behind TLS with `N8N_SECURE_COOKIE=true` and SSO; use Postgres instead of SQLite; run queue mode with workers; use external task runners for Code nodes; keep the editor off the public internet so only `/webhook/*` is exposed.
- **Dedupe store in a database** (Redis or Convex) instead of workflow static data, which is per-instance.
- **Clerk webhooks** to sync profile changes and handle account deletion (anonymise loans, delete the user row) for GDPR.
- **Pagination** on the browse and loan lists, and availability precomputed on the tool instead of read per request.
- **Timezones:** loan dates are UTC calendar days. I'd store the neighbourhood's timezone and compute "overdue" in it.
- **Rate limiting** per user on request creation (Convex rate-limiter component), and abuse reporting.
- **More tests:** Playwright for the main flows, and a CI job that runs `pnpm test` and `build-workflows.mjs`, failing if the committed workflow JSON differs.
- **Observability:** structured logs and an alert on outbox backlog or age, not just final failures. Execution data retention to match the privacy policy.
- **Admin audit log** for removals and Trusted Lender changes.
