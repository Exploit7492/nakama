# Nakama Render Project

Nakama server configuration for Render deployment with a Supabase
PostgreSQL database.

## Configuration comes from the environment

No credential is stored in this repository. `start.sh` reads every secret
from the environment at container start and passes it to Nakama on the
command line, which overrides `nakama.yml`. Rotating the database password
is therefore a Render-side change only:

1. Update `SUPABASE_DB_PASS` (or `DATABASE_URL`) in the Render dashboard.
2. Render redeploys the service automatically when an environment variable
   changes.
3. The new value is used. No code change and no repository round trip.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_DB_USER` | yes* | Database user, e.g. `postgres.<project-ref>` |
| `SUPABASE_DB_PASS` | yes* | Database password |
| `SUPABASE_DB_HOST` | yes* | Database host |
| `DATABASE_URL` | no | Full DSN; when set it wins over the three above |
| `NAKAMA_SERVER_KEY` | yes | Nakama server key (socket key and HTTP basic-auth) |
| `SESSION_ENCRYPTION_KEY` | no | Defaults to `NAKAMA_SERVER_KEY`. Keep it stable or sessions break |
| `SESSION_REFRESH_ENCRYPTION_KEY` | no | Defaults to `SESSION_ENCRYPTION_KEY` |
| `CONSOLE_USERNAME` | no | Defaults to `admin` |
| `CONSOLE_PASSWORD` | no | Defaults to `NAKAMA_SERVER_KEY` |
| `SUPABASE_DB_PORT` | no | Defaults to `5432` |
| `SUPABASE_DB_NAME` | no | Defaults to `postgres` |
| `SUPABASE_DB_SSLMODE` | no | Defaults to `require` |
| `RENDER_SERVICE_URL` | no | Target of the keepalive ping |
| `PING_INTERVAL` | no | Keepalive interval in seconds, defaults to `300` |

*Not required when `DATABASE_URL` is set.

The service exits with a clear message naming the missing variable when a
required one is absent, rather than failing later with an authentication
error.

## Deployment

This project is configured to deploy on Render.com as a Web Service. The
variables in the table above are set in the Render dashboard under
**Environment**; `.env.example` lists them for local use. Render redeploys
the service automatically when an environment variable changes.

> The database password is not in this repository, and must not be. A
> `.env` file previously committed here held a live password; it has been
> removed and `.gitignore` now excludes it. That password was also present
> in git history and should be treated as compromised and rotated.

