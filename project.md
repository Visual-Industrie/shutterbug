# Camera Club Membership & Competition System — Project Reference

## Overview

A web-based system for managing camera club memberships and photography competitions. It replaces an existing Google Sheets-based setup. Members and judges do **not** have logins — access is granted via unique tokenised URLs sent by email.

---

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
| WYSIWYG editor | TipTap |

---

## Key Architectural Decisions

- **No member or judge logins.** All access is via unique tokenised URLs (UUIDs) sent by email.
- **Token types:** `submission` (per member, per competition), `judging` (per judge, per competition), `member_history` (per member, no expiry, emailed on request).
- **Google Sheets** are used only as the initial data source for a one-time import/seed script. All live data lives in Postgres.
- **Google Drive** stores all uploaded entry images. The DB stores the Drive file ID, URL, and thumbnail URL. There is already a Drive folder with these images in and a Google sheet with old entry details
- **Points are snapshotted** on the entry row (`points_awarded`) at judging time AND written to a `member_points` ledger for fast leaderboard queries. This protects against retroactive config changes.
- **Entry limits are enforced in application logic**, not DB constraints, so they remain configurable per competition.

---

## User Roles

### Admin Users (have logins)
| Role | Access |
|---|---|
| `super_admin` | Full access |
| `competition_secretary` | Competition management, entries, judging |
| `treasurer` | Member records, membership status |
| `president` | Read access to everything |
| `committee` | Read access to everything |

### Non-admin actors (no logins, token-based)
- **Members** — submit entries via `/submit/[token]`, view history via `/history/[token]`
- **Judges** — score entries via `/judge/[token]`

---

## Core Features

### Member Management
- Member database (imported from Google Sheets initially)
- Fields: first name, last name, email, phone, membership number, membership type, status, experience level, annual sub amount, subs paid, subs due date, payment method, joined date, notes
- Status: `active` | `inactive` | `suspended`
- Membership type: `full` | `life` | `complimentary`
- Subscription status: `active` | `on_hold` | `cancelled`
- Subs amount is pro-rated: $50 if joining first half of year, $25 if joining second half
- Experience level: `beginner` | `intermediate` | `advanced`
- Members must consent to: Privacy Act, image use, club rules (captured at join time)
- Admin can create, edit, deactivate members
- Treasurer can manage subscription payment status

### Applicant Management
- Prospective members self-register via a public `/join` page (no login required)
- Fields collected: first name, last name, email, phone
- On submission: creates a pending applicant record with application date, annual sub amount, and pay-by date
- Applicants appear in a dedicated admin list (separate from members)
- Treasurer action: "Record Payment" — converts applicant to active member record
- Applicant statuses: `pending` | `approved` | `rejected`

### Competition Management
- Events belong to a **Season** (annual) and have an **event type**: `competition` | `award` | `other`
- Regular competitions have configurable open/close dates for submissions and judging
- Status flow: `draft` → `open` → `closed` → `judging` → `complete`
- Entry limits (PRINTIM and PROJIM) are **configurable per competition** — not hardcoded; defaults to 2 PRINTIM + 1 PROJIM
- Points values per award are **configurable per competition**
- Award events (e.g. "Printed Image Champion of the Year", "Projected Image of the Year") are tracked as events with type `award` — they have no entries or judging window
- Historic competitions are in Google Sheets already
- Competitions will include a name, closing date (always at 4pm on a Wednesday)

### Entry Submission (Member Portal)
- Member receives a unique `/submit/[token]` URL per competition via email
- Token validated on load; expired or revoked tokens are rejected
- Member uploads entries (images) — uploaded to Google Drive
- Each image has a title
- Entry types: `printim` (printed image) | `projim` (projected image)
- Entry limits enforced from competition config at submission time; defaults to 2 PRINTIM + 1 PROJIM
- Member can view their existing entries for the competition on the portal
- Confirmation email sent on submission

### Judging Portal
- Judge receives a unique `/judge/[token]` URL per competition
- Token is time-limited (judging window)
- Judge sees all entries for that competition
- For each entry, judge assigns an award and writes a comment (WYSIWYG / TipTap — stored as HTML)
- Award levels: `honours` | `highly_commended` | `commended` | `accepted` | `not_placed`
- On completion, points are written to the ledger and admin is notified
- Judge only sees member number, not name

### Points & Leaderboard
- Points are tracked **per season** (annual reset)
- Default points per award (overridable per competition):
  - Honours = 6
  - Highly Commended = 4
  - Commended = 2
  - Accepted = 1
  - Winner = 0 (non-points events e.g. Trust House, Aratoi)
  - Shortlisted = 0 (non-points events)
- Entries that receive no award are implicitly "Not Placed" (0 points) — "Not Placed" is not a judge-selectable option
- Each award level has a description text shown to judges during scoring
- Leaderboard shows PRINTIM and PROJIM tabs separately, current season only
- Lifetime points not tracked (annual only)

### Judge Guidelines Page
- Static page linked from the judge portal (`/judge/[token]`) explaining the club's judging philosophy
- Content: scoring categories (Honours, Highly Commended, Commended, Accepted), guidance on writing comments, format of the club evening
- Can be hardcoded HTML or admin-editable rich text

### Admin Dashboard
Key operational indicators shown on the admin home page:
- Competitions with no judge assigned (count)
- Competitions remaining this year (count)
- Judges available (count)
- Competitions currently open (count)
- PRINTIM entry count for the current open competition
- PROJIM entry count for the current open competition
- Committee member count
- Current active member count
- Submitters in last 3 months
- Pending applicants count
- Life member count
- Event schedule (current and upcoming competitions, with status, judge, entry counts)

### Bulk Image Download
- Admin can bulk-download all entries (or filtered by PROJIM only) for a competition as a zip file
- Sourced from Google Drive; used to pre-download images for club night projection (venue has poor internet)
- Available in the Event Management screen alongside other competition actions

### Member History Portal
- Member can request a link via email at any time
- Link format: `/history/[token]` — no expiry, re-emailed on request
- Shows all past entries, awards, judge comments, and points

### Email Log (Admin UI)
- Searchable log of all emails sent by the system (and inbound if applicable)
- Shows: subject, sender/recipient, date/time, expandable body preview
- Accessible from the admin navigation
- All automated and one-off emails written to `email_log` regardless of success or failure

### Email Automations
All emails are logged in the `email_log` table with success/error status.

| Email | Trigger |
|---|---|
| Submission invite | Admin triggers per competition |
| Submission reminder | Scheduled before competition closes |
| Submission confirmation | Member completes upload |
| Judging invite | Admin assigns judge and triggers |
| Results notification | Admin publishes results |
| Member history link | Member requests via form or admin sends |
| One-off / bulk | Admin composes and sends to one member, selected members, or the whole club |
| Subs reminder (1st) | Scheduled ~Dec 13 — reminder to members who haven't paid for next year |
| Subs reminder (2nd) | Scheduled ~Jan 13 — final reminder before grace period ends |

---

## Database Schema

```sql
-- MEMBERS
CREATE TYPE membership_type AS ENUM ('full', 'life', 'complimentary');
CREATE TYPE experience_level AS ENUM ('beginner', 'intermediate', 'advanced');

CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  membership_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',        -- active | inactive | suspended
  membership_type membership_type NOT NULL DEFAULT 'full',
  sub_status TEXT NOT NULL DEFAULT 'active',    -- active | on_hold | cancelled
  experience_level experience_level,
  annual_sub_amount NUMERIC(8,2),
  subs_paid BOOLEAN NOT NULL DEFAULT FALSE,
  subs_paid_date DATE,
  subs_paid_amount NUMERIC(8,2),
  subs_due_date DATE,
  payment_method TEXT,
  joined_date DATE,
  privacy_act_ok BOOLEAN NOT NULL DEFAULT FALSE,
  image_use_ok BOOLEAN NOT NULL DEFAULT FALSE,
  club_rules_ok BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- APPLICANTS
CREATE TYPE applicant_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  annual_sub_amount NUMERIC(8,2),
  pay_by_date DATE,
  status applicant_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SEASONS (calendar years: Jan 1 – Dec 31, pre-populated)
-- Two year concepts: membership year (when subs are collected) vs event year (when competitions run)
-- These are offset by one: event year 2026 = membership year 2025 subs
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL UNIQUE,                      -- e.g. 2026
  starts_at DATE NOT NULL,                       -- always Jan 1
  ends_at DATE NOT NULL,                         -- always Dec 31
  is_current_event_year BOOLEAN NOT NULL DEFAULT FALSE,
  is_current_membership_year BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SETTINGS (global club configuration)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,                          -- e.g. 'COMP-Upload Limit PROJIM'
  section TEXT NOT NULL,                         -- COMP | SUBS | CONFIG | EMAILROLE | ADMIN
  label TEXT NOT NULL,
  value TEXT,                                    -- stored as text, cast in app
  default_value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Seed with defaults: club name, admin email, upload limits, reminder days, role emails, AGM date, subs grace period

-- COMPETITIONS / EVENTS
CREATE TYPE event_type AS ENUM ('competition', 'award', 'other');

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  event_type event_type NOT NULL DEFAULT 'competition',
  name TEXT NOT NULL,
  description TEXT,
  opens_at TIMESTAMPTZ,                          -- NULL for award/other events
  closes_at TIMESTAMPTZ,                         -- NULL for award/other events
  judging_opens_at TIMESTAMPTZ,
  judging_closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  max_projim_entries INT NOT NULL DEFAULT 1,     -- projected image (digital)
  max_printim_entries INT NOT NULL DEFAULT 2,    -- printed image
  points_honours INT NOT NULL DEFAULT 6,
  points_highly_commended INT NOT NULL DEFAULT 4,
  points_commended INT NOT NULL DEFAULT 2,
  points_accepted INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- JUDGES
CREATE TABLE judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  address TEXT,
  photo_drive_url TEXT,                          -- headshot stored on Google Drive
  rating NUMERIC(2,1),                           -- 1.0–5.0 star rating
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE competition_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  judge_id UUID NOT NULL REFERENCES judges(id),
  UNIQUE(competition_id, judge_id)
);

-- TOKENS
CREATE TYPE token_type AS ENUM ('submission', 'judging', 'member_history');

CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  type token_type NOT NULL,
  member_id UUID REFERENCES members(id),
  judge_id UUID REFERENCES judges(id),
  competition_id UUID REFERENCES competitions(id),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT token_has_valid_owner CHECK (
    (type = 'submission' AND member_id IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'judging' AND judge_id IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'member_history' AND member_id IS NOT NULL)
  )
);

-- ENTRIES
CREATE TYPE entry_type AS ENUM ('projim', 'printim');  -- projim=projected/digital, printim=printed
-- Note: 'not_placed' is implicit (no award assigned); 'winner'/'shortlisted' for non-points events
CREATE TYPE award_level AS ENUM ('honours', 'highly_commended', 'commended', 'accepted', 'winner', 'shortlisted');

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  member_id UUID NOT NULL REFERENCES members(id),
  type entry_type NOT NULL,
  title TEXT NOT NULL,
  drive_file_id TEXT,
  drive_file_url TEXT,
  drive_thumbnail_url TEXT,
  award award_level,
  judge_comment TEXT,           -- HTML from TipTap
  judged_at TIMESTAMPTZ,
  judged_by UUID REFERENCES judges(id),
  points_awarded INT,           -- snapshot at time of judging
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- POINTS LEDGER
CREATE TABLE member_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  season_id UUID NOT NULL REFERENCES seasons(id),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  entry_id UUID NOT NULL REFERENCES entries(id),
  points INT NOT NULL DEFAULT 0,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entry_id)
);

-- ADMIN USERS
CREATE TYPE admin_role AS ENUM ('president', 'competition_secretary', 'treasurer', 'committee', 'super_admin');

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role admin_role NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EMAIL LOG
CREATE TYPE email_type AS ENUM (
  'submission_invite',
  'submission_reminder',
  'submission_confirmation',
  'judging_invite',
  'results_notification',
  'member_history_link',
  'subs_reminder',
  'one_off'
);

CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type email_type NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  member_id UUID REFERENCES members(id),
  judge_id UUID REFERENCES judges(id),
  competition_id UUID REFERENCES competitions(id),
  token_id UUID REFERENCES tokens(id),
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

-- INDEXES
CREATE INDEX idx_tokens_token ON tokens(token);
CREATE INDEX idx_tokens_member ON tokens(member_id);
CREATE INDEX idx_tokens_judge ON tokens(judge_id);
CREATE INDEX idx_entries_competition ON entries(competition_id);
CREATE INDEX idx_entries_member ON entries(member_id);
CREATE INDEX idx_member_points_member_season ON member_points(member_id, season_id);
CREATE INDEX idx_email_log_member ON email_log(member_id);
CREATE INDEX idx_applicants_status ON applicants(status);
```

---

## Suggested Build Order

1. **Supabase project setup + run schema** (use Supabase CLI for local dev, MCP server for Claude Code integration)
2. **Drizzle ORM setup + type-safe schema**
3. **Google Sheets import script** (one-time member seed)
4. **Admin dashboard scaffold** — auth, member management, competition management, email log UI
5. **Applicant workflow** — public `/join` form + treasurer "Record Payment" action
6. **Token generation + Resend email integration**
7. **Member submission portal** (`/submit/[token]`) + Google Drive upload
8. **Judge portal** (`/judge/[token]`) + TipTap WYSIWYG + award scoring + judge guidelines page
9. **Points ledger write** on judging completion
10. **Bulk image download** — zip export of competition entries from Google Drive
11. **Email automations** (reminders, results, history link, one-off/bulk send)
12. **Member history portal** (`/history/[token]`)
13. **Leaderboard views** (season points, PRINTIM + PROJIM tabs)

---

## Notes & Constraints

- Entry limits (PRINTIM/PROJIM) are enforced in **application logic only**, not DB constraints, to keep them reconfigurable. Defaults come from the `settings` table.
- Seasons are **calendar years** (Jan 1–Dec 31). Two `is_current` flags exist: one for membership year, one for event year — these are offset (membership year lags event year by one).
- `award` on entries is nullable — a NULL award means "Not Placed" (0 points). Judges only select positive awards.
- Award level descriptions (shown to judges during scoring) are seeded into the `settings` table or hardcoded in the app.
- Subs are pro-rated: $50 if joining Jan–Jun, $25 if joining Jul–Dec. Grace period runs to ~Apr 1 for prior-year subs.
- Judge comments are stored as **raw HTML** (TipTap output) in `entries.judge_comment`.
- The `keep-alive.yml` GitHub Action pings Supabase every 3 days to prevent the free tier from pausing — ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set as GitHub Actions secrets.
- All automated emails must be written to `email_log` regardless of success or failure.
- Tokens should be checked for `revoked_at IS NULL` and `expires_at > NOW()` on every request.
- Only one `season` should have `is_current = TRUE` at any time — enforce this in application logic when creating/updating seasons.

---

## Local Development

- Use the **Supabase CLI** for local development: `supabase start` spins up a full local stack (Postgres, Auth, Storage, Studio)
- Local Studio runs at `http://localhost:54323`, API at `http://localhost:54321`
- Connect **Claude Code** to the local Supabase instance via MCP: `claude mcp add --transport http supabase http://localhost:54321/mcp`
- Run schema migrations via `supabase db push` or by applying SQL in the local Studio
- Use `supabase gen types typescript --local` to regenerate Drizzle-compatible TypeScript types after schema changes