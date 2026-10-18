#!/bin/sh
#
# Nakama startup.
#
# Every credential is read from the environment when the container starts.
# Nothing sensitive is baked into this image, so rotating the database
# password is a Render-side change only: update SUPABASE_DB_PASS (or
# DATABASE_URL), redeploy, and the new value is used. No code change and no
# repository round trip.

set -eu

echo '=== Starting Nakama with Supabase ==='

# --- Database -----------------------------------------------------------
# DATABASE_URL, when present, is the whole DSN and wins. Otherwise the DSN
# is assembled from the parts, so the password can live on its own.
if [ -n "${DATABASE_URL:-}" ]; then
  DB_ADDRESS="$DATABASE_URL"
else
  : "${SUPABASE_DB_USER:?SUPABASE_DB_USER is required (or set DATABASE_URL)}"
  : "${SUPABASE_DB_PASS:?SUPABASE_DB_PASS is required (or set DATABASE_URL)}"
  : "${SUPABASE_DB_HOST:?SUPABASE_DB_HOST is required (or set DATABASE_URL)}"
  DB_ADDRESS="${SUPABASE_DB_USER}:${SUPABASE_DB_PASS}@${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT:-5432}/${SUPABASE_DB_NAME:-postgres}?sslmode=${SUPABASE_DB_SSLMODE:-require}"
fi

# --- Nakama keys --------------------------------------------------------
# The server key is basic-auth for the HTTP API and the socket key, so it
# must be set. The encryption keys default to it when not given separately.
: "${NAKAMA_SERVER_KEY:?NAKAMA_SERVER_KEY is required}"

SESSION_ENCRYPTION_KEY="${SESSION_ENCRYPTION_KEY:-$NAKAMA_SERVER_KEY}"
SESSION_REFRESH_ENCRYPTION_KEY="${SESSION_REFRESH_ENCRYPTION_KEY:-$SESSION_ENCRYPTION_KEY}"
CONSOLE_USERNAME="${CONSOLE_USERNAME:-admin}"
CONSOLE_PASSWORD="${CONSOLE_PASSWORD:-$NAKAMA_SERVER_KEY}"

# Create necessary directories
mkdir -p /nakama/data/logs
mkdir -p /nakama/data/modules

# Start keepalive in background
/keepalive.sh &

echo 'Running migrations...'
/nakama/nakama migrate up \
  --config /nakama/data/nakama.yml \
  --database.address "$DB_ADDRESS"

echo 'Starting Nakama server...'
exec /nakama/nakama \
  --config /nakama/data/nakama.yml \
  --database.address "$DB_ADDRESS" \
  --socket.server_key "$NAKAMA_SERVER_KEY" \
  --session.encryption_key "$SESSION_ENCRYPTION_KEY" \
  --session.refresh_encryption_key "$SESSION_REFRESH_ENCRYPTION_KEY" \
  --console.username "$CONSOLE_USERNAME" \
  --console.password "$CONSOLE_PASSWORD"
