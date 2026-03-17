# Shutterbug — Completed Work

This document summarises everything built so far in the Shutterbug Camera Club Membership & Competition Management System. It is intended to give Claude conversational AI enough context to discuss upcoming work and help plan a backlog.

---

## What is Shutterbug?

A web app replacing a Google Sheets setup for the Wairarapa Camera Club. It manages members, competitions, entries, judging, and points. Members and judges have **no logins** — all access is via tokenised UUID links sent by email. Only admins log in (password-based JWT auth).

**Stack:** React + TypeScript + Vite (frontend) · Node.js/TypeScript on Vercel serverless (backend) · PostgreSQL on Supabase · Drizzle ORM · Resend (email) · Google Drive (image storage)

**Deployed at:** Vercel (prod) + local Supabase stack for dev

---

## Admin Roles

| Role | Access |
|---|---|
| `super_admin` | Full access including destructive actions |
| `competition_secretary` | Competition management |
| `treasurer` | Member/subscription records |
| `president` | Read-only + email template editing |
| `committee` | Read-only |

---

## Completed Features

### Foundation
- **Initial schema** — all tables: `members`, `applicants`, `seasons`, `competitions`, `competition_judges`, `judges`, `tokens`, `entries`, `member_points`, `admin_users`, `settings`, `email_log`, `committee_roles`, `committee_members`, `email_templates`
- **Drizzle ORM** type-safe schema (`src/db/schema.ts`)
- **Single Vercel serverless function** (`api/index.ts`) handling all `/api/*` routes via Express — consolidates to stay within Vercel Hobby plan's 12-function limit
- **Local dev API server** (`scripts/dev-api.ts`) — thin wrapper that dynamically imports `api/index.ts` after loading `.env.local`; no duplication of routes
- **Google Sheets one-time import script** (`scripts/import-click-data.ts`) — seeds members from `WCCDatabase.xlsx`
- **Admin seed script** (`scripts/seed-admin.ts`) — creates initial super_admin user

### Auth
- JWT-based login (`POST /api/auth/login`) with 7-day token
- `GET /api/auth/me` — token validation
- `POST /api/auth/change-password` — authenticated password change
- Profile page (`/profile`) with change-password form
- Protected routes via `ProtectedRoute` component + `AuthContext`

### Member Management
- Members list page with search, status filter (defaults to active), and add/edit modal
- Fields: name, email, phone, membership number, status, membership type, experience level, subs paid/due, joined date, annual sub amount
- All list filtering done client-side (TanStack Query caches full list)
- `POST /api/members`, `PATCH /api/members/:id`

### Applicant Management
- Public `/join` page — self-registration form (name, email, phone, consents)
- `POST /api/applicants` (public, no auth)
- Applicants list in admin with pending/approved/rejected filter
- `PATCH /api/applicants/:id` — edit applicant details
- `POST /api/applicants/:id/record-payment` — converts applicant to active member

### Competition Management
- Events list page with search, status filter, type filter
- Add event modal (slide-in panel) — pre-filled with defaults from settings table
- Event detail page (`/competitions/:id`) with full management UI
- `POST /api/competitions`, `PATCH /api/competitions/:id`
- **Delete competition** (`DELETE /api/competitions/:id`) — super_admin only; cascades member_points → entries → email_log FKs nulled → tokens → competition_judges → competition; confirmation modal in UI warns of destructive action and shows entry count
- Competition status flow: `draft` → `open` → `closed` → `judging` → `complete` (manually advanced by admin)
- Season auto-derived from `opens_at` year; upserted automatically
- Judge assignment per competition (`PUT /api/competitions/:id/judge`)
- **Bulk entry download** — "Download all entries" and "Download PROJIM only" buttons on Competition Detail; server streams a zip of all Drive images

### Email Actions (from Competition Detail page)
- Send submission invites to all active members
- Send submission invite to a single member
- Send submission reminders
- Send judging invite to assigned judge
- Send results notification to all members who submitted

### Judge Management
- Judges list with search, availability filter, view modal showing bio/social links/competition history
- Add/edit judge modal — fields: name, email, bio, address, rating, availability, website, Facebook, Instagram
- `POST /api/judges`, `PATCH /api/judges/:id`

### Member Submission Portal (`/submit/:token`)
- Token-gated, no login required
- Validates token on load (checks `revoked_at IS NULL AND expires_at > NOW()`)
- Member uploads PROJIM (digital) and PRINTIM (print) entries up to competition limits
- **Direct-to-Drive upload** — browser uploads directly to Google Drive resumable upload URL to bypass Vercel's body size limit
- Image processing on upload: EXIF stripped, resized to max 1920px, renamed with membership number + competition
- Entries listed with thumbnail previews; member can delete their own entries
- Confirmation email sent on each submission

### Judge Portal (`/judge/:token`)
- Token-gated, no login required
- Shows all entries for the competition (member number only, never name)
- Judge assigns award level and writes comment (TipTap WYSIWYG, stored as HTML)
- Award levels: `honours` | `highly_commended` | `commended` | `accepted` (null = not placed)
- "Complete judging" action writes points to `member_points` ledger and notifies admin
- Judge comments included in results emails

### Member History Portal (`/history/:token`)
- Token-gated, no login required; token has no expiry
- Shows member's full competition history: entries, awards, judge comments, points
- `POST /api/members/:id/send-history-link` — admin triggers email with link

### Points & Leaderboard
- Points snapshotted to `entries.points_awarded` AND written to `member_points` ledger at judging completion
- Leaderboard page (`/leaderboard`) with PROJIM and PRINTIM tabs, current season
- Points configurable per competition (defaults from settings)

### Settings (super_admin only)
- **Competition Defaults tab** — default points per award level, default entry limits (PROJIM/PRINTIM); pre-fills new competition form
- `GET /api/settings`, `PATCH /api/settings`

### Committee Management (super_admin only, in Settings)
- **Roles** — create/delete committee roles (e.g. President, Secretary, Treasurer)
- **Committee members** — add/edit/remove members from roles with start/end dates and notes
- "End today" shortcut to mark a member as stepping down
- Former committee members collapsible section
- `GET|POST /api/committee/roles`, `DELETE /api/committee/roles/:id`
- `GET|POST /api/committee/members`, `PATCH|DELETE /api/committee/members/:id`

### Committee Member Login (Invite Flow)
- super_admin can click "Grant Login" on any current committee member
- Selects an admin role (`committee` | `competition_secretary` | `treasurer` | `president`)
- System sends invite email via Resend with a set-password link (7-day expiry)
- `/set-password?token=...` public page — member sets password to activate account
- Login route guards against unactivated accounts (null `password_hash`)
- "✓ Has login" badge shown in committee list once account is active
- `POST /api/auth/invite`, `POST /api/auth/set-password`
- Schema: `admin_users` gains `member_id`, `invite_token`, `invite_expires_at`; `password_hash` made nullable

### Email — Log, Compose & Templates
- **Email log** (`/email`) — Log tab with searchable list of all sent emails, expandable body preview
- **Compose** — slide-in panel to send a one-off email to all active members, members with unpaid subs, or a specific member (search by last name)
- **Subscription reminders** — Settings → Subscriptions tab; manual "Send first reminder" / "Send second reminder" buttons; automated via GitHub Actions cron (Dec 13 and Jan 13, 8am NZDT) calling `POST /api/email/subs-reminder` with `x-cron-secret` auth
- **Email template editor** — Templates tab on the Email page; TipTap rich-text body editor with bold/italic/list toolbar; subject line text input; `[placeholder]` syntax with a reference panel (click to copy); role-gated save (super_admin, president, competition_secretary only)
- 7 editable templates: `submission_invite`, `submission_reminder`, `judging_invite`, `member_history_link`, `results_notification`, `subs_reminder_first`, `subs_reminder_second`
- Templates stored in `email_templates` table; API falls back to hardcoded defaults if a row is missing
- `GET /api/email-templates`, `PATCH /api/email-templates/:key`

---

## Database Migrations (in order)

| File | Description |
|---|---|
| `20260222000000_initial_schema.sql` | Full initial schema |
| `20260317000000_settings_comp_points_defaults.sql` | Seed default settings rows |
| `20260317000001_judges_social_fields.sql` | Add website/facebook/instagram to judges |
| `20260317000002_committee.sql` | Add committee_roles and committee_members tables |
| `20260317000003_admin_invite.sql` | Add invite flow columns to admin_users |
| `20260318000000_email_templates.sql` | Add email_templates table seeded with defaults |

---

## Known Limitations / Tech Debt

- No automated tests.
- Competition status transitions are manual (admin clicks through states) — no automated date-based status changes.
- No member-facing leaderboard (public view) — current leaderboard is admin-only.
- No way to resend a competition's results email to a specific member.
- Judge guidelines page (static content shown to judges) not yet built.
- API error handling is inconsistent on the frontend — some pages show toasts, some inline messages, some nothing.

---

## Pages & Routes

| Route | Type | Description |
|---|---|---|
| `/login` | Public | Admin login |
| `/join` | Public | Member self-registration |
| `/set-password` | Public | Activate admin account from invite |
| `/submit/:token` | Token-gated | Member entry submission portal |
| `/judge/:token` | Token-gated | Judge scoring portal |
| `/history/:token` | Token-gated | Member competition history |
| `/` | Admin | Dashboard |
| `/members` | Admin | Member management |
| `/applicants` | Admin | Applicant management |
| `/competitions` | Admin | Events list |
| `/competitions/:id` | Admin | Event detail & management |
| `/judges` | Admin | Judge management |
| `/leaderboard` | Admin | Season points leaderboard |
| `/email` | Admin | Email log, compose, and template editor |
| `/profile` | Admin | Change password |
| `/settings` | Admin (super_admin) | App settings + committee management |
