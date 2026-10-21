# Spec: Judge Availability Round

Annual email to all judges listing next season's unjudged competitions. Each judge gets a magic link to a page where they confirm whether they're staying on the judges list and rank the competitions they'd like to judge.

Stack and conventions follow `CLAUDE.md`: TypeScript throughout, Express routes in `api/index.ts` **and** mirrored in `scripts/dev-api.ts`, Drizzle schema in `src/db/schema.ts`, React + TanStack Query on the frontend, and Resend for email.

---

## 1. Decisions (already agreed)

| # | Decision |
|---|---|
| 1 | "Judging / club night" date = `competitions.judging_closes_at`. No new column. |
| 2 | Listed competitions = all competitions in the chosen season with **no row in `competition_judges`**. |
| 3 | `judges.availability` stays `'available' \| 'unavailable'`. The email shows the judge's current value. |
| 4 | Option 2 ("not this year") keeps or sets the judge as `available`. |
| 5 | Option 3 ("remove me") **archives** the judge with `archived_at`. Nothing is deleted. |
| 6 | Judges can change their response any number of times until the deadline. |
| 7 | No maximum number of selections. |
| 8 | Admin gets a preferences grid with one-click Assign, using the existing `PUT /api/competitions/:id/judge`. |
| 9 | The judge gets a confirmation email on every save. Admin gets a notification email when a judge chooses option 3. |
| 10 | Reminders are sent manually with a "Remind non-responders" button. |
| 11 | A bulk send (invite or reminder) writes **one** `email_log` row. Per-judge confirmations are logged individually. BL-2 will replace this later. |
| 12 | New token type `judge_availability`, scoped per judge per season. Expires at the response deadline. |

---

## 2. Database migration

File: `supabase/migrations/20261021000000_judge_availability.sql`

```sql
-- Enum additions (ALTER TYPE ... ADD VALUE can't be used in the same transaction it's added in;
-- keep these at the top and don't reference the new values elsewhere in this migration)
ALTER TYPE token_type ADD VALUE IF NOT EXISTS 'judge_availability';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_invite';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_reminder';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_confirmation';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_admin_notice';

-- Archive judges instead of deleting
ALTER TABLE judges ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE judges ADD COLUMN archived_reason TEXT;

-- Tokens: scope to a season
ALTER TABLE tokens ADD COLUMN season_id UUID REFERENCES seasons(id);

ALTER TABLE tokens DROP CONSTRAINT token_has_valid_owner;
ALTER TABLE tokens ADD CONSTRAINT token_has_valid_owner CHECK (
  (type = 'submission'         AND member_id IS NOT NULL AND competition_id IS NOT NULL) OR
  (type = 'judging'            AND judge_id  IS NOT NULL AND competition_id IS NOT NULL) OR
  (type = 'member_history'     AND member_id IS NOT NULL) OR
  (type::text = 'judge_availability' AND judge_id IS NOT NULL AND season_id IS NOT NULL)
);
-- (type::text comparison avoids using the new enum value in the same transaction)

CREATE UNIQUE INDEX uq_tokens_judge_availability
  ON tokens(judge_id, season_id) WHERE type::text = 'judge_availability';

-- Responses: one per judge per season
CREATE TYPE judge_availability_response AS ENUM ('keen', 'not_this_year', 'remove');

CREATE TABLE judge_availability_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id UUID NOT NULL REFERENCES judges(id),
  season_id UUID NOT NULL REFERENCES seasons(id),
  response judge_availability_response NOT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_id, season_id)
);

-- Ranked preferences (only for response = 'keen')
CREATE TABLE judge_competition_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES judge_availability_responses(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank >= 1),
  UNIQUE (response_id, competition_id),
  UNIQUE (response_id, rank)
);

CREATE INDEX idx_jcp_competition ON judge_competition_preferences(competition_id);
```

If the migration runner wraps everything in a single transaction and Postgres complains about the enum additions, split the `ALTER TYPE` lines into their own earlier migration file (`20261021000000_…_enums.sql`, then `…000001_…`).

Update `src/db/schema.ts` to match, then run `npm run types:gen`.

**Competition delete cascade.** `DELETE /api/competitions/:id` already nulls or deletes dependants. Preferences cascade through the FK, so no code change is needed. Verify this after implementing.

---

## 3. Shared types

`src/types/judge-availability.ts` (imported by both API and frontend):

```ts
export type JudgeAvailabilityResponse = 'keen' | 'not_this_year' | 'remove';

export interface AvailabilityCompetition {
  id: string;
  name: string;
  description: string | null;
  closesAt: string;          // ISO, entries close
  judgingClosesAt: string | null; // ISO, judging / club night
  filled: boolean;           // true if a judge has since been assigned
}

export interface AvailabilityPageData {
  judge: { firstName: string; name: string; availability: 'available' | 'unavailable'; archived: boolean };
  season: { id: string; name: string };
  deadline: string;          // ISO, token expires_at
  competitions: AvailabilityCompetition[];
  current: {
    response: JudgeAvailabilityResponse | null;
    preferences: string[];   // competition ids in rank order
    respondedAt: string | null;
  };
}

export interface AvailabilitySubmitBody {
  response: JudgeAvailabilityResponse;
  preferences: string[];     // competition ids, index 0 = rank 1; must be [] unless 'keen'
}
```

---

## 4. Server logic

Create `src/server/judge-availability.ts` holding the logic. Routes in `api/index.ts` and `scripts/dev-api.ts` should be thin wrappers that call into it, so the two copies can't drift.

### Eligibility helpers
- `getEligibleCompetitions(seasonId)` returns competitions where `season_id = seasonId` and `NOT EXISTS (SELECT 1 FROM competition_judges WHERE competition_id = c.id)`, ordered by `closes_at`.
- `getRecipientJudges()` returns judges where `archived_at IS NULL` (both available and unavailable).

### Token
- `upsertAvailabilityToken(judgeId, seasonId, deadline)` reuses an existing token for that judge and season if there is one, so resent links keep working. Set `expires_at = deadline` and `revoked_at = NULL`.
- Validation follows the existing rule: `revoked_at IS NULL AND expires_at > NOW()`. When a token is **expired**, the GET endpoint still returns the data with a `readOnly: true` flag so the judge can see what they submitted. Writes are rejected with 410.

### Saving a response (single transaction)
1. Validate the token.
2. Validate the body:
   - `keen` requires `preferences.length >= 1`, with no duplicates.
   - `not_this_year` and `remove` require `preferences` to be empty.
   - Every preference id must be an eligible competition **at the time of save**. Silently drop ids that have become `filled`. If that leaves `keen` with zero preferences, return 409 `{ error: 'all_selected_filled' }`.
3. Upsert `judge_availability_responses` and set `updated_at`.
4. Delete the existing preferences for that response, then insert the new ones with `rank = index + 1`.
5. Update the judge:
   - `keen` / `not_this_year`: set `availability = 'available'`, `archived_at = NULL`, `archived_reason = NULL`.
   - `remove`: set `archived_at = NOW()` and `archived_reason = 'Self-removed via availability form <season name>'`. Leave `availability` untouched.
6. After commit, send the confirmation email to the judge and log it.
7. If the response is `remove` **and** the previous response was not `remove`, send the admin notice. Recipients are `super_admin` users and `competition_secretary` users. Log it.

Archived judges keep a valid token until the deadline, so they can still change their mind (step 5 unarchives them).

### Archived judges elsewhere in the app
- `GET /api/judges` excludes archived judges by default. Add a `?includeArchived=true` option and a "Show archived" toggle on the Judges page.
- The judge assignment dropdown on Competition Detail excludes archived judges.
- The Judge view/edit modal shows an "Archived <date> — <reason>" banner with an **Unarchive** button (`PATCH /api/judges/:id { archived_at: null }`).

---

## 5. API endpoints

### Admin (JWT; `super_admin` or `competition_secretary`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/judge-availability/:seasonId` | Overview: season, deadline (from tokens), eligible competitions, recipient count, and per-judge rows `{ judge, response, preferences[], respondedAt, tokenUrl }` |
| POST | `/api/judge-availability/:seasonId/send` | Body `{ deadline: ISO }`. Upserts tokens for all recipients and sends invites. Writes **one** `email_log` row. |
| POST | `/api/judge-availability/:seasonId/remind` | Sends a reminder to recipients with no response row. Writes **one** `email_log` row. |
| PATCH | `/api/judge-availability/:seasonId/deadline` | Body `{ deadline }`. Updates `expires_at` on all of that season's availability tokens. |
| POST | `/api/judge-availability/:seasonId/judges/:judgeId/resend` | Resends the invite to one judge (logged individually). |

The `send` endpoint should return 409 if tokens already exist for the season, unless the body contains `{ force: true }`. The UI asks "Already sent on <date> — send again?" This prevents accidental double-sends.

### Public (token-gated, no auth)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/public/judge-availability/:token` | Returns `AvailabilityPageData` plus `readOnly` |
| PUT | `/api/public/judge-availability/:token` | Body `AvailabilitySubmitBody` |

### Batch email logging (decision 11)

For `send` and `remind`, send each email individually with a unique link, collecting successes and failures. Then insert **one** `email_log` row:

```ts
{
  type: 'judge_availability_invite',            // or _reminder
  recipient_email: `${sent} judges`,            // summary, e.g. "18 judges"
  recipient_name: `Judge availability — ${season.name}`,
  subject,                                       // the actual subject line
  error: failures.length
    ? `Failed (${failures.length}): ${failures.map(f => `${f.email}: ${f.message}`).join('; ')}`
    : null,
}
```

Write the row even if every send fails. Use Resend's batch endpoint (`resend.batch.send`, chunks of 100) if it's already in use; otherwise send sequentially.

---

## 6. Emails

All dates are formatted in `Pacific/Auckland`, e.g. `Sat 14 Mar 2027`. Put the formatter in a shared `formatNzDate()` util if one doesn't already exist. The link is `${APP_URL}/judge-availability/${token}`.

### Invite: `judge_availability_invite`

**Subject:** `Wairarapa Camera Club — judging for the {seasonName} season`

> Kia ora {firstName},
>
> You're on the Wairarapa Camera Club's list of judges. Thank you for being part of it. We currently have you listed as **{Available | Unavailable}**.
>
> This email is twofold:
>
> 1. **Would you like to stay on our judges list?**
> 2. **Which, if any, of our {seasonName} competitions would you be interested in judging?**
>
> The competitions still needing a judge are below. Please let us know by **{deadline}** using your personal link:
>
> **[Respond here]({link})**
>
> | Competition | Entries close | Judging / club night |
> |---|---|---|
> | **{name}** — {description} | {closesAt} | {judgingClosesAt} |
> | … | | |
>
> You can come back to the link and change your response any time before {deadline}.
>
> Ngā mihi,
> {senderName}, Wairarapa Camera Club

Render the competition list as an HTML table for desktop. Stack it as cards in the plain-text fallback. If `judgingClosesAt` is null, show "TBC".

### Reminder: `judge_availability_reminder`

Same body as the invite, with a one-line opener: *"Just a quick reminder — we haven't heard back from you yet about judging for {seasonName}."*

### Confirmation: `judge_availability_confirmation`

**Subject:** `Thanks — your judging response for {seasonName}`

- `keen`: "Thanks! You'd like to judge the following, in order of preference:" followed by a numbered list with dates. Add: "We'll be in touch to confirm."
- `not_this_year`: "Thanks for letting us know. We'll keep you on the list and be in touch next year."
- `remove`: "We've removed you from our judges list. Thanks for everything you've done for the club."
- Every version ends with: "Changed your mind? Use your link before {deadline}: {link}"

### Admin notice: `judge_availability_admin_notice`

**Subject:** `Judge removed themselves: {judgeName}`. The body gives the judge's name, email, and season, with a link to `/judges`.

---

## 7. Judge page: `/judge-availability/:token`

Public route that reuses the layout of `/judge/:token`. It must be mobile-first, since judges will open it from the email on their phones.

**Dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

### Layout
1. **Header:** "Kia ora {firstName}". Below it: "Judging for the {seasonName} season · Please respond by {deadline}". Current status is shown as a badge (Available / Unavailable).
2. **Three option cards** (radio behaviour, large tap targets):
   1. **"I'd love to judge — I'll make my selections in order of preference below."**
   2. **"I can't do any of these, but please consider me in future years."**
   3. **"Please remove me from the list."**
3. **Competition picker** (visible only when option 1 is selected):
   - **Available competitions:** a card per competition with a checkbox, name, description, and both dates ("Entries close Sat 14 Mar 2027 · Judging / club night Tue 31 Mar 2027"). Ticking a card appends it to the bottom of "Your preferences".
   - **Your preferences:** a numbered sortable list (`SortableContext`, `verticalListSortingStrategy`) with a drag handle on each row. Also include **↑ / ↓ buttons** on each row, because drag is unreliable on phones and inaccessible to keyboard users. Configure `PointerSensor`, `TouchSensor` with a 150ms delay, and `KeyboardSensor` (`sortableKeyboardCoordinates`). Unticking a competition removes it from the list.
   - Competitions with `filled: true` show greyed out with a "Judge confirmed" label and can't be selected.
4. **Submit button.** The label changes with the option: "Send my preferences" / "Send response" / "Remove me". Option 3 needs a confirmation step: "Are you sure? You can undo this using this link before {deadline}."
5. **Success state:** a summary of what was saved, the note "You can change this any time before {deadline}", and an "Edit response" button that returns to the form with values pre-filled.

### States
- **Loading:** spinner.
- **Invalid or revoked token:** "This link isn't valid. Please contact the club."
- **Expired (`readOnly`):** shows the saved response read-only with "Responses closed on {deadline}. Please contact the club if anything has changed."
- **Previously responded:** loads in the success state with the saved values.
- **Validation:** option 1 with nothing selected keeps the submit button disabled, with the hint "Select at least one competition".
- **409 `all_selected_filled`:** "Sorry — the competitions you picked have just been filled." Refetch and show the form again.

---

## 8. Admin UI

### Entry point
Add a **"Request availability"** button on the Judges page header. It opens `/judges/availability`, with a season dropdown that defaults to the season after the current one.

### `/judges/availability` page

**Top panel: send controls**
- Season selector.
- A preview of eligible competitions (name, entries close, judging date) and the recipient count ("18 judges, including 4 marked Unavailable").
- A deadline date picker (default: today + 21 days), plus a **Send to all judges** button. If already sent, this becomes a **Remind non-responders ({n})** button and an **Edit deadline** button.
- A summary line: "Sent {date} · {x} responded · {y} keen · {z} not this year · {w} removed · {n} no response".

**Tab 1: By competition** (the assignment view)
- One card per eligible competition, showing its dates.
- Each card lists the interested judges sorted by their rank for that competition. Each row shows the judge's name, a rank badge ("1st choice", "3rd of 5"), and an **Assign** button.
- **Assign** calls the existing `PUT /api/competitions/:id/judge`, then invalidates the query. The card then shows "Assigned: {name}", and that competition appears as `filled` for other judges on their page.
- Show "No interest yet" for competitions nobody selected.

**Tab 2: By judge**
- A table with columns: judge, current availability, response badge, preferences (numbered and comma-separated, truncated with a tooltip), responded at, and actions.
- Actions are **Copy link** and **Resend**.
- Add a filter by response, including "No response".

Use TanStack Query key `['judge-availability', seasonId]`. Invalidate it after send, remind, deadline change, assign, and resend.

---

## 9. Build order

1. Migration, Drizzle schema, `types:gen`
2. `src/server/judge-availability.ts` (eligibility, tokens, save transaction)
3. Public GET/PUT endpoints in both `api/index.ts` and `dev-api.ts`
4. The judge page `/judge-availability/:token`, including drag and drop
5. Email templates plus send/remind/resend endpoints with batch logging
6. The admin `/judges/availability` page (send controls plus both tabs)
7. Archived-judge handling across the Judges page, the assignment dropdown, and the edit modal

---

## 10. Acceptance checks

- [ ] Only competitions in the selected season with no `competition_judges` row appear, both in the email and on the page.
- [ ] Archived judges receive no invite or reminder and don't appear in the assignment dropdown.
- [ ] Resending reuses the same token, so the earlier link still works.
- [ ] Option 1 saves preferences in the order shown, and rank 1 is the top of the list.
- [ ] Switching from option 1 to option 2 clears the preferences.
- [ ] Option 3 archives the judge. Switching back to option 1 or 2 before the deadline unarchives them and sets them to Available.
- [ ] An Unavailable judge choosing option 1 or 2 becomes Available.
- [ ] After the deadline, the page is read-only and PUT returns 410.
- [ ] A competition assigned in admin shows as "Judge confirmed" on judges' pages, and saving drops it from preferences.
- [ ] A bulk send produces exactly one `email_log` row with a summary recipient and any failures listed in `error`.
- [ ] Each confirmation and admin notice produces its own `email_log` row.
- [ ] Drag-reorder works on iOS Safari and Android Chrome, and the ↑/↓ buttons work everywhere.
- [ ] Dates display in NZ time on the page and in emails.
