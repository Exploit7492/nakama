# SECURITY — credential rotation required

Added during the account migration. This repository has no suspended-account
references, so nothing needed repointing. It does carry a **live Supabase
database credential in its git history**, which needs rotating.

## What is exposed

- Project: `atojskxrxfsbpeefigtm`
- Host: `aws-0-eu-west-1.pooler.supabase.com` (session pooler, port 6543)
- User: `postgres.atojskxrxfsbpeefigtm`
- Files: `nakama.yml`, `start.sh`
- Commits: `ad2ff2d`, `9636067`, `1615e8e`, `ee3cd5f`

`HEAD` is already clean — `nakama.yml` reads "The address carries the password,
so it is NOT set here." The credential survives in history, so any clone with
full history recovers it via `git log -p --all`.

## Why rotation, not a rewrite

The bundle this repo came from was served over a public HTTP endpoint during
the migration, so the value is already outside our control. Removing it from
history does not un-expose it. **Rotate the password** for project
`atojskxrxfsbpeefigtm`, or delete the project if unused.

## Note

`start.sh` already reads the credential from `DATABASE_URL` or the
`SUPABASE_DB_*` environment variables, so rotation needs no code change.
