# Shutterbug

Camera Club Membership & Competition Management System — a web-based replacement for a legacy Google Sheets + Softr setup.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS v4 |
| Backend | Node.js + TypeScript (Vercel serverless functions) |
| Database | PostgreSQL via Supabase |
| ORM | Drizzle ORM |
| Email | Resend |
| File storage | Google Drive API |
| Auth | JWT (admin only) |
| Hosting | Vercel |

## Features

- **Admin dashboard** — KPI widgets, alert banners for actionable issues
- **Member management** — full CRUD, subscription tracking, experience levels
- **Applicant workflow** — public self-registration form → treasurer approves → active member
- **Competition management** — full lifecycle (draft → open → closed → judging → complete)
- **Token-based portals** — members and judges access via emailed UUID links (no logins)
- **Submission portal** (`/submit/[token]`) — members upload PROJIM/PRINTIM entries, images stored in Google Drive
- **Judge portal** (`/judge/[token]`) — anonymised entries, TipTap rich-text comments, award scoring
- **Points ledger** — snapshotted at judging time, season leaderboard
- **Member history portal** (`/history/[token]`) — permanent link showing a member's full competition history
- **Email automations** — submission invites, reminders, judging invites, results notifications
- **Email log** — full audit trail of all sent emails

## Local Development

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (for local Supabase)

### Setup

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env.local

# Start local Supabase (Postgres + Studio)
supabase start

# Apply schema
supabase db push

# Seed first admin user
npm run seed:admin
```

### Running locally

```bash
npm run dev
```

This starts both the Express API server (port 3003) and the Vite dev server (port 5173) concurrently.

| URL | Description |
|---|---|
| `http://localhost:5173` | Admin UI |
| `http://localhost:5173/join` | Public member registration form |
| `http://localhost:54323` | Supabase Studio |

Default admin credentials (after seeding): `admin@wcc.local` / `changeme123`

### Other scripts

```bash
npm run db:generate    # Generate Drizzle migration files
npm run db:push        # Push schema to database
npm run db:studio      # Open Drizzle Studio
npm run import:click   # One-time import from legacy Google Sheets export
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Secret for signing admin JWT tokens |
| `APP_URL` | Base URL for token links in emails |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service account for Drive uploads |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google service account private key |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder ID for entry images |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

## Access Model

- **Admin users** authenticate with email/password → JWT (7-day expiry)
- **Members and judges have no logins** — all access via tokenised UUID links sent by email
- Token types: `submission` (per member per competition), `judging` (per judge per competition), `member_history` (per member, permanent)

## Deployment

The project is configured for Vercel. Connect the repo and set all environment variables from `.env.example` in the Vercel dashboard.
