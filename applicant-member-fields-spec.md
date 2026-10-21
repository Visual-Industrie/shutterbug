# Spec — Persist all application fields + member self-edit details

## Problem

The public `/join` form collects more fields than `POST /api/applicants` saves. Address, experience level and possibly other fields are dropped. Some are also lost again when `POST /api/applicants/:id/record-payment` converts an applicant to a member.

Members also have no way to update their own details. Today only admins can edit them.

## Goals

1. Every field on the `/join` form is persisted on `applicants`.
2. Every applicant field that belongs on a member carries across on conversion to `members`.
3. Admins can view and edit all of these fields on both the Applicants and Members pages.
4. Members can view and edit their own details through a token-gated portal, with no login.

Stack: TypeScript throughout. React frontend, separate backend (`api/index.ts` Express on Vercel, mirrored in `scripts/dev-api.ts`).

---

## Step 1 — Audit first (do this before writing code)

Produce a table in your first reply comparing these four places:

| Field | `/join` form | `applicants` table | `members` table | Saved by `POST /api/applicants`? | Copied by `record-payment`? |
|---|---|---|---|---|---|

Sources to check:
- The `/join` page component and its form state type
- `POST /api/applicants` handler, in **both** `api/index.ts` and `scripts/dev-api.ts`
- `POST /api/applicants/:id/record-payment` handler, in both files
- `applicants` and `members` in `src/db/schema.ts`

Any field on the form that is not saved is in scope. Known gaps: **address** and **experience level**. Expect others, such as membership type, how they heard about the club, interests, emergency contact and consents.

Stop after the audit and confirm the list with me before migrating.

---

## Step 2 — Schema migration

New migration: `supabase/migrations/2026102100000_applicant_member_profile_fields.sql`.

### Address

Use structured columns, not one text blob. Add them to **both** `applicants` and `members`:

```sql
address_line1   TEXT,
address_line2   TEXT,
suburb          TEXT,
town_city       TEXT,
postcode        TEXT
```

If the form collects a separate postal address, also add:

```sql
postal_same_as_physical BOOLEAN NOT NULL DEFAULT TRUE,
postal_line1   TEXT,
postal_line2   TEXT,
postal_suburb  TEXT,
postal_town_city TEXT,
postal_postcode  TEXT
```

If the form currently uses a single free-text address box, split it into the structured fields on the form. Don't store the blob.

### Other fields

- `experience_level`: `members` already has it. Add it to `applicants` with the **same type/enum**.
- Each other unsaved field from the audit: add it to `applicants`. Also add it to `members` if it's an ongoing member attribute rather than application-only, such as consents.
- Consents: store as `BOOLEAN` plus a `*_consented_at TIMESTAMPTZ`. Copy both to members on conversion.

All new columns are nullable (or have a default), so existing rows are unaffected.

Then:
- Update `src/db/schema.ts` to match
- Run `npm run types:gen`
- `supabase db reset --local` to verify the migration applies cleanly

---

## Step 3 — Backend

### Shared validation

Create `src/shared/memberProfile.ts` with:
- A `MemberProfileFields` TypeScript type
- A zod schema `memberProfileSchema` for the editable personal fields (name, phone, address fields, experience level, consents and any other audit fields)

Use it in every handler below so the field list lives in one place. Trim strings and convert empty strings to `null`.

### Endpoints (update both `api/index.ts` and `scripts/dev-api.ts`)

| Endpoint | Change |
|---|---|
| `POST /api/applicants` | Validate the full form with zod and insert all fields. |
| `PATCH /api/applicants/:id` | Accept all new fields. |
| `POST /api/applicants/:id/record-payment` | Copy all member-relevant fields to the new `members` row. Do it explicitly field by field, not by spreading the applicant object. |
| `PATCH /api/members/:id` | Accept all new fields. |
| `GET /api/portal/:token/profile` | **New.** Token-gated. Returns the member's editable profile plus read-only fields (membership number, membership type, status). |
| `PATCH /api/portal/:token/profile` | **New.** Token-gated. Validates with `memberProfileSchema` and updates the member. |

### Portal token rules

- Reuse the existing `member_history` token. It's per member and already emailed. Don't add a new token type.
- Validate as usual: `revoked_at IS NULL` and (`expires_at IS NULL OR expires_at > NOW()`).
- **Fields members can edit:** first/last name, phone, address, postal address, experience level, consents, and other personal fields from the audit.
- **Fields members can NOT edit:** membership number, status, membership type, subs paid/due, annual sub amount, joined date, notes. Strip them server-side even if they're sent.
- **Email change:** allow it, but check uniqueness against `members.email` and return `409` with a friendly message on conflict. After a change, send a short notice to the **old** address ("your email was changed"). Log it to `email_log` with a new `email_type` value `member_details_changed`. This needs an enum addition in the migration.
- Set `updated_at = NOW()` on every update.

---

## Step 4 — Frontend

### `/join`

- Make sure every field is wired into the submitted payload. This is likely where the drop happens, so verify with the network tab.
- Add the structured address inputs. Make Address line 1, Town/City and Postcode required.
- If there's a postal address: a "Postal address same as above" checkbox that hides the postal fields.

### Admin — Applicants and Members

- Add the new fields to the add/edit slide-over or modal, in an **Address** section and a **Photography** section (experience level etc.).
- Show a compact address on the applicant row/detail so whoever records the payment can see it.

### Member portal — `/history/:token`

- Turn the page into a two-tab layout: **My entries** (the existing history) and **My details** (new).
- **My details** uses the same form component as admin. Extract a shared `<MemberProfileForm>` so `/join`, admin and the portal stay in sync.
- Show read-only fields (membership number, type, status) as plain text above the form.
- Save button → `PATCH /api/portal/:token/profile` → success toast. Show the 409 email-conflict message inline.
- Rename the page heading to "My membership". Keep the `/history/:token` URL so existing emailed links still work.
- Update the `member_history_link` email copy to mention that members can update their details there.

---

## Acceptance checklist

- [ ] Audit table produced and confirmed
- [ ] Submitting `/join` with every field filled → all values visible in Supabase Studio on the `applicants` row
- [ ] `record-payment` → all member-relevant values on the new `members` row
- [ ] Admin can edit every new field for applicants and members
- [ ] Member opens `/history/:token` → **My details** tab → edits address → saved and visible in admin
- [ ] Member can't change membership number, status or subs, even via a crafted request
- [ ] Changing to an email already in use → 409 shown inline
- [ ] Email change sends a notice to the old address, logged in `email_log`
- [ ] Revoked token → portal rejects both GET and PATCH
- [ ] `api/index.ts` and `scripts/dev-api.ts` both updated (diff the route lists)
- [ ] Update `completed.md` and the migrations table
