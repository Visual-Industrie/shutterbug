# Shutterbug — Backlog

Everything still to be built. See `completed.md` for what's already done.

---

## Medium Priority

### Season Management
Seasons are auto-created from competition dates but `is_current_event_year` and `is_current_membership_year` are never set in the UI.
- Settings UI to designate the current event year and current membership year
- Enforce only one `is_current = true` at a time (application logic)
- Leaderboard and dashboard stats should filter by current event year season

### Judge Guidelines Page
Static content shown to judges during scoring explaining the club's judging philosophy.
- Linked from the judge portal (`/judge/:token`) as a panel or separate page
- Content: scoring categories, guidance on writing comments, format of the club evening
- Either hardcoded HTML or an admin-editable rich text field in Settings

### Competition Status Advancement
Currently admins manually advance status with no guardrails.
- "Advance status" button on Competition Detail with a confirmation step
- Or automated: status changes based on dates (`opens_at`, `closes_at`, etc.)
- Advancing to `judging` could optionally auto-send the judging invite

### Public Leaderboard
Members should be able to view the season leaderboard without logging in.
- Public URL (no auth, no token required)
- PROJIM and PRINTIM tabs
- Current season only
- Could be linked from the member history portal

### Member Detail / Notes / Consent
Fields exist in the DB but aren't fully exposed in the admin UI.
- `notes` — free text notes per member, editable by any admin
- `privacy_act_ok`, `image_use_ok`, `club_rules_ok` — consent flags visible (and editable) in member detail
- `payment_method` — visible/editable by treasurer
- Consider a dedicated member detail/profile view rather than cramming everything into the edit modal

### Admin User Management
Currently no UI to see or manage who has admin access.
- List all admin users with their roles and last login
- super_admin can edit role, deactivate/reactivate accounts
- Complements the existing committee "Grant Login" invite flow

---

## Lower Priority

### Resend Results to Specific Member
"Send Results" currently emails all submitters at once. Need a targeted resend.
- Button per member/entry on Competition Detail
- Useful when a member didn't receive their results email

### Dashboard Improvements
Several stats from the spec are not yet displayed on the dashboard:
- Competitions with no judge assigned
- Competitions remaining this year
- Judges available count
- Submitters in the last 3 months
- Life member count
- Full event schedule (upcoming competitions with status, judge, entry counts)

### Email Log Improvements
- Filter by email type, date range, member

---

## Tech Debt

### Automated Tests
No tests exist. High-value areas to cover first:
- Token validation logic
- Points calculation and ledger writes on judging completion
- Competition delete cascade
- Email sending (mock Resend)

### Error Handling Consistency
API errors are handled inconsistently on the frontend — some show toasts, some inline messages, some nothing. Standardise on a single pattern.

---

## Previously Captured (from original backlog)

### BL-1 — Multi-club Support
Allow multiple camera clubs to run on a single Shutterbug install with full data isolation.
- Add a `clubs` table; add `club_id` FK to all tenant-scoped tables
- Admin users belong to one club; super_admin can access all
- `/join/[slug]` for club-specific applicant registration
- One deployment, multi-tenant in DB
- Paid Vercel + Supabase tiers needed at scale — fine to defer

### BL-2 — Batched Email Log Entries
When sending invites/reminders/results to all members of a competition, the email log should show one summary row rather than one row per recipient.
- Add `email_batches` table; `email_log` gets nullable `batch_id`
- UI shows batch rows collapsed by default, expandable to individual sends

### BL-3 — Resend Submission / Judging Link from Admin
Resend a magic link to a specific member for a specific competition from the Members admin page. Also: "Resend judging link" on the Competition Detail judge card.
