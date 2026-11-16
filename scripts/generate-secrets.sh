#!/usr/bin/env bash
# Creates ./.env for docker compose with fresh random secrets, then prints
# the matching commands for the Convex deployment. Safe to re-run: it never
# overwrites an existing .env.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo ".env already exists; leaving it alone." >&2
else
  rand() { openssl rand -hex 32; }
  # Only the n8n section of .env.example belongs in .env.
  sed -n '/^# ---------- 3\./,$p' .env.example |
    sed -e "s/^N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=$(rand)/" \
        -e "s/^HMAC_SECRET_CONVEX_TO_N8N=.*/HMAC_SECRET_CONVEX_TO_N8N=$(rand)/" \
        -e "s/^HMAC_SECRET_N8N_TO_CONVEX=.*/HMAC_SECRET_N8N_TO_CONVEX=$(rand)/" \
    > .env
  echo "Wrote .env with new secrets."
fi

# shellcheck disable=SC1091
set -a; source .env; set +a
cat <<MSG

Now give Convex the same HMAC secrets (run these once 'npx convex dev' is up):

  npx convex env set HMAC_SECRET_CONVEX_TO_N8N "$HMAC_SECRET_CONVEX_TO_N8N"
  npx convex env set HMAC_SECRET_N8N_TO_CONVEX "$HMAC_SECRET_N8N_TO_CONVEX"
  npx convex env set N8N_REQUEST_WEBHOOK_URL "http://localhost:5678/webhook/lendloop-request-events"
MSG
