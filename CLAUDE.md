# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shutterbug is a web-based Camera Club Membership & Competition Management System, replacing a Google Sheets setup. The full specification lives in [project.md](project.md).

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node.js + TypeScript (Vercel serverless functions) |
| Database | PostgreSQL on Supabase (free tier) |
| ORM | Drizzle ORM |
| Email | Resend |
| File storage | Google Drive API |
| Auth (admin only) | JWT or NextAuth |
| Hosting | Vercel |
| WYSIWYG | TipTap (comments stored as raw HTML) |

## Local Development

```bash
# Spin up local Supabase stack (Postgres, Auth, Storage, Studio)
npm run supabase start   # or: ./node_modules/.bin/supabase start

# Local Studio: http://127.0.0.1:54323  |  API: http://127.0.0.1:54321
# Connect Claude Code to local Supabase via MCP:
claude mcp add --transport http supabase http://127.0.0.1:54321/mcp

# Apply schema migrations
./node_modules/.bin/supabase db push --local

# Reset DB and reapply all migrations (use during schema dev)
./node_modules/.bin/supabase db reset --local

# Regenerate TypeScript types after schema changes
npm run types:gen

# Start the frontend dev server
npm run dev
```

## Project Structure
```
src/
  db/
    schema.ts       # Drizzle ORM schema (source of truth)
    client.ts       # Server-side DB client (Vercel API functions only)
  lib/
    supabase.ts     # Supabase browser client
  types/
    supabase.ts     # Generated types (npm run types:gen)
api/                # Vercel serverless functions
supabase/
  migrations/       # SQL migrations (generated or hand-written)
  config.toml       # Supabase local config
```

## Architecture

### Access Model
- **Members and judges have no logins** — all access is via tokenised UUIDs sent by email.
- Token types: `submission` (per member, per competition), `judging` (per judge, per competition), `member_history` (per member, permanent).
- Routes: `/submit/[token]`, `/judge/[token]`, `/history/[token]`
- Token validation on every request must check: `revoked_at IS NULL AND expires_at > NOW()`

### Admin Roles
`super_admin` | `competition_secretary` | `treasurer` | `president` | `committee`

### Competition Status Flow
`draft` → `open` → `closed` → `judging` → `complete`

### Points System
- Points are **snapshotted** at judging time on `entries.points_awarded` AND written to the `member_points` ledger table (for fast leaderboard queries). This protects against retroactive config changes.
- Default points: Honours=4, Highly Commended=3, Commended=2, Accepted=1, Not Placed=0 — all overridable per competition.
- Points tracked per season only (annual reset); no lifetime totals.

### Key Constraints (enforce in application logic, not DB)
- Entry limits (digital/print) are per-competition config, not DB constraints.
- Only one `season` should have `is_current = TRUE` at any time.
- Judges see member number only — never member name (anonymity).
- All emails (success or failure) must be written to `email_log`.

### External Services
- **Google Drive**: stores all entry images; DB stores `drive_file_id`, `drive_file_url`, `drive_thumbnail_url`.
- **Google Sheets**: one-time seed source only — all live data in Postgres.
- **Resend**: transactional email delivery.
- **GitHub Actions** (`keep-alive.yml`): pings Supabase every 3 days to prevent free tier pause. Requires `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Actions secrets.

## Suggested Build Order

1. Supabase project setup + run schema from `project.md`
2. Drizzle ORM setup + type-safe schema
3. Google Sheets import script (one-time member seed)
4. Admin dashboard scaffold (auth, member management, competitions)
5. Token generation + Resend email integration
6. Member submission portal (`/submit/[token]`) + Google Drive upload
7. Judge portal (`/judge/[token]`) + TipTap + award scoring
8. Points ledger write on judging completion
9. Email automations (reminders, results, history link)
10. Member history portal (`/history/[token]`)
11. Leaderboard views (season points, admin dashboard)
