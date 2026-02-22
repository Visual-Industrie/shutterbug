# Backlog

Tracked features and architectural work not yet built.

---

## BL-1 — Multi-club support

**Goal:** Allow multiple camera clubs to run on a single Shutterbug install, each with full data isolation. Enables selling to other clubs without separate deployments.

**Approach:**
- Add a `clubs` table (`id`, `name`, `slug`, `logo_url`, `config`)
- Add `club_id` FK column to every tenant-scoped table: `members`, `applicants`, `competitions`, `seasons`, `judges`, `competition_judges`, `entries`, `tokens`, `email_log`, `member_points`, `admin_users`
- Admin users belong to one club (or `super_admin` can access all)
- All queries filter by `club_id` derived from the authenticated user's JWT payload
- Public portal routes (`/submit/[token]`, `/judge/[token]`, `/history/[token]`) are already token-scoped — tokens table gets `club_id` too, but no URL change needed
- `/join` form needs a club slug in the URL (`/join/[slug]`) so applicants land on the right club's form
- Vercel env stays the same — one `DATABASE_URL`, one deploy, multi-tenant in DB

**Schema changes required:**
```sql
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,       -- used in /join/[slug]
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE members ADD COLUMN club_id UUID REFERENCES clubs(id);
-- (repeat for all tenant tables)
```

**Notes:**
- Current single-club data would be migrated to a default `clubs` row
- Paid Vercel + Supabase tiers will be needed once multi-club traffic grows — fine to defer

---

## BL-2 — Batched competition emails with single log entry

**Goal:** When submission invites, reminders, judging invites, or results are sent to all members of a competition, the email log should show **one summary row** (e.g. "Submission invites — March Competition — 52 recipients") rather than 52 individual rows. Individual magic links are still unique per member.

**Approach:**
- Add an `email_batch` table:
  ```sql
  CREATE TABLE email_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID REFERENCES competitions(id),
    type TEXT NOT NULL,           -- 'submission_invite' | 'reminder' | 'judging_invite' | 'results'
    recipient_count INT NOT NULL,
    skipped_count INT NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    sent_by UUID REFERENCES admin_users(id)
  );
  ```
- `email_log` gets a nullable `batch_id UUID REFERENCES email_batches(id)` — individual records still exist for delivery auditing / bounce tracking, but the UI groups by batch
- Email log admin UI shows batch rows collapsed by default; expandable to show individual sends
- `sendSubmissionInvites`, `sendReminders`, etc. in `competition-actions.ts` create a batch record and attach `batch_id` to each `email_log` insert

---

## BL-3 — Resend magic link from member profile

**Goal:** Treasurer or competition secretary can resend a submission invite (magic link) to a specific member for a specific competition, directly from the Members admin page.

**Approach:**
- On the member's edit slide-over (or a dedicated member detail view), add a "Competitions" section listing open/upcoming competitions they have a token for
- "Resend link" button calls a new endpoint: `POST /api/members/:id/resend-submission-link` with `{ competition_id }`
- Handler: looks up the existing token (or creates one), sends the submission invite email to just that member, writes to `email_log`
- This reuses `upsertSubmissionToken` and the existing email template — no new token is minted if one already exists
- Also useful for judges: "Resend judging link" on the competition detail page's judge card (`POST /api/competitions/:id/resend-judging-invite`)
