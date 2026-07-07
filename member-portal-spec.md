# Shutterbug — Member Self-Service Portal Spec

**Status:** Ready for implementation
**Audience:** Claude Code
**Related docs:** `project.md`, `CLAUDE.md`, `completed.md`

---

## 1. Goal

Consolidate the member-facing experience into a single, magic-link-accessed portal at `/portal/[token]`. Members land on their competition history by default and can, from tabs on the same page:

- View past competition entries, awards, judge comments, and points.
- Upload entries to any currently **open** competition (reusing the existing submission form).
- Edit their own personal details (address, phone, email — self-service).

Two access-recovery requirements are **critical** and must not be dropped:

1. If a member lands on the portal **without a token in the URL and without a valid session cookie**, they are shown a **lookup form** (email + membership number). On a match, they are emailed a fresh magic link.
2. The existing `/history/[token]` route must **redirect** to `/portal/[token]` so old bookmarked/emailed links keep working.

This is a member-facing feature only. No changes to admin auth or admin routes.

---

## 2. Access & Token Model

The portal reuses the existing **`member_history`** token type (per member, **no expiry**, re-emailable on request). No new token type is introduced.

### 2.1 Token validation

`member_history` tokens have `expires_at IS NULL`, so the standard check must be written to tolerate a null expiry:

```sql
revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
```

Do **not** copy the `expires_at > NOW()` check verbatim from the submission/judging portals — that would reject every history token.

### 2.2 Three access scenarios

The portal must handle all three:

| Scenario | Behaviour |
|---|---|
| **A. Token in URL** (`/portal/:token`) | Validate token. On success, establish a session cookie, then `history.replaceState` to strip the token from the URL (land on `/portal`). Render the portal. On failure, fall through to the lookup form (scenario C) with a "that link is no longer valid" notice. |
| **B. No token in URL, valid session cookie** (`/portal`) | Resolve the member from the cookie via the backend. Render the portal. |
| **C. No token in URL, no valid cookie** (`/portal`) | Render the **lookup form** (email + membership number → resend magic link). |

### 2.3 Session cookie

When a valid token is presented (scenario A), set an **httpOnly, Secure, SameSite=Lax** cookie holding the token value (or a signed session referencing it). Rationale:

- The React app never needs to read the token in JS — it calls `GET /api/portal/me`, which reads the cookie server-side and returns the member context.
- Keeps the token out of the address bar (after `replaceState`) and out of `document.cookie`.

Cookie lifetime: long (e.g. 180 days) — the whole point is that members stop needing to dig through email. Because the token itself has no expiry, the cookie can be long-lived; it is invalidated the moment the underlying token is revoked (checked on every `/api/portal/me` call).

---

## 3. Routes

### Frontend (React Router)

| Route | Behaviour |
|---|---|
| `/portal/:token` | Establish session from token (scenario A), strip token from URL, render portal. |
| `/portal` | Render portal if session cookie resolves (scenario B); otherwise render lookup form (scenario C). |
| `/history/:token` | **Redirect** to `/portal/:token` (preserve the `:token` param). Use `<Navigate replace>` or a small redirect component. |

Keep `/submit/:token` and `/judge/:token` untouched — those remain their own token-scoped flows.

---

## 4. Backend Endpoints

All portal endpoints live in the single `api/index.ts` Express app (Vercel Hobby 12-function limit). **Mirror every new route in `scripts/dev-api.ts`** — this mirror has drifted before and caused confusion, so add the routes to both in the same change.

Member identity in every authenticated portal endpoint is derived **from the validated token/cookie, never from the request body.** The client cannot pass a `member_id`.

### `POST /api/portal/session`
Establish a session from a magic-link token.
- **Body:** `{ token: string }`
- Validate token (`type = 'member_history'`, `revoked_at IS NULL`, expiry-tolerant check above).
- On success: set the httpOnly session cookie, return `{ member: { id, firstName, lastName, ... } }`.
- On failure: `401` — frontend then shows the lookup form.

### `GET /api/portal/me`
Resolve the current member from the session cookie.
- Reads cookie, re-validates the token (so revocation takes effect immediately).
- Returns the member profile + everything the portal needs to render (or split into the endpoints below).
- `401` if no/invalid cookie → frontend shows lookup form.

### `POST /api/portal/request-link`  *(public, no session)*
The lookup / resend-magic-link flow. **This is the critical recovery path.**
- **Body:** `{ email: string, membershipNumber: string }`
- Look up a single member where **both** email and membership number match the same record.
- If matched: find-or-create that member's `member_history` token (reuse if one exists — do not mint duplicates), send the magic link via Resend, and write to `email_log` (type `member_history_link`).
- **Always return the same generic `200` response** regardless of whether a match was found — e.g. `{ ok: true }` with UI copy like "If those details match a member, we've sent a link to that email address." This prevents membership/email enumeration.
- Add basic rate limiting / throttling per IP + email to blunt abuse.

### `PATCH /api/portal/profile`
Self-service profile update.
- Requires valid session cookie; `member_id` comes from the session.
- **Editable fields only:** `address`, `phone`, `email`. Reject or ignore anything else in the body (never let a member change `membershipNumber`, `status`, `subsPaid`, points, etc.).
- If `email` changes: it must stay unique (members.email is `UNIQUE`) — return a clear validation error on conflict. Consider whether an email change should invalidate the current magic link / require re-verification; for v1, a straightforward update is acceptable but **note this decision in code comments**.
- Returns the updated member profile.

### Entry upload from the portal
Reuse the existing direct-to-Drive submission machinery from `/submit/:token`. Recommended approach so we don't surface submission tokens inside the portal:

- Add a portal-scoped variant that derives `member_id` from the session cookie and `competition_id` from the open competition, then calls the **same** upload/processing path (EXIF strip, resize to 1920px, membership-number + competition rename, thumbnail generation, `entries` insert, confirmation email).
- Entry limits continue to be enforced **in application logic** from competition config (digital/print), exactly as today.
- Alternatively, have the backend find-or-create the member's `submission` token for the open competition and hand it to the existing submit component. Either is fine; deriving identity from the session is preferred. Pick one and keep it consistent.

---

## 5. Portal UI

Single page at `/portal`, rendered once a session is established. Tabbed layout, **Competitions** tab active by default.

### Tab: Competitions
1. **Open competition submission (top of tab).** For each competition currently in `open` status, render the existing submission form (the `/submit` upload component) so the member can add entries inline — no separate link needed. Show entry-limit state (e.g. "1 of 2 print entries used") and allow deleting their own not-yet-judged entries, as the submit portal already does. If there is no open competition, hide this section (or show a small "No competitions are open right now" note).
   - Handle the multi-open case: if more than one competition is `open`, show each with a clear heading. Don't assume exactly one.
2. **History (below).** The member's full past-entry history — entries, awards, judge comments (rendered HTML), and points — grouped by competition, most recent first. This is the content currently served by `/history/:token`.

> Naming: label the tab **"Competitions"** (covers both current uploads and past entries) rather than "History."

### Tab: My Profile
- Form to edit **address, phone, email**.
- Pre-populated from the member record. Save calls `PATCH /api/portal/profile`.
- Show first name / last name / membership number as **read-only** context (so they know whose record they're editing) — these are not editable here.
- Standard toast on success; inline validation errors (e.g. email already in use).

### Lookup form (scenario C)
Shown at `/portal` when there's no token and no valid session:
- Two fields: **Email** and **Membership number**.
- Submit → `POST /api/portal/request-link`.
- Always show the same neutral confirmation ("If those details match a member, we've sent a magic link to that email"), whether or not a match existed.
- Include a short line explaining what the portal is, so a cold landing isn't confusing.

Reuse existing toast/modal and form patterns from the admin app for consistency.

---

## 6. Security Checklist

- [ ] Portal token check is expiry-tolerant (`expires_at IS NULL OR expires_at > NOW()`) **and** `revoked_at IS NULL`, re-checked on every `/api/portal/me` call.
- [ ] `member_id` for all authenticated portal actions is derived from the token/cookie, never from the client.
- [ ] `PATCH /api/portal/profile` whitelists editable fields (address, phone, email only).
- [ ] `POST /api/portal/request-link` returns an identical response for match and no-match (no enumeration) and is rate-limited.
- [ ] Session cookie is httpOnly, Secure, SameSite=Lax.
- [ ] Email change respects the `members.email` UNIQUE constraint with a friendly error.
- [ ] All portal-triggered emails (magic link resend, submission confirmations) are written to `email_log`.

---

## 7. Files Likely to Change

- `src/db/schema.ts` — confirm `address` exists on `members` (added recently); no new tables expected.
- `api/index.ts` — new portal routes.
- `scripts/dev-api.ts` — **mirror** the new portal routes (keep in lockstep).
- React: new `PortalPage` (tabbed) + `PortalLookupForm`; redirect on `/history/:token`; reuse existing submission-form and history-view components rather than rewriting them.
- Resend email template for the magic-link resend (can reuse the existing history-link email template if suitable).

---

## 8. Acceptance Criteria

1. Visiting a valid `/portal/:token` establishes a session, strips the token from the URL, and shows the Competitions tab.
2. Revisiting `/portal` later (same browser) loads the portal from the cookie without needing the link again.
3. Visiting `/portal` with no token and no cookie shows the lookup form.
4. Submitting a **matching** email + membership number emails a fresh magic link; submitting a non-matching pair shows the **same** confirmation and sends nothing.
5. `/history/:token` redirects to `/portal/:token` and works exactly as scenario A.
6. With an open competition, the member can upload entries from the Competitions tab, respecting per-competition entry limits, and see confirmation.
7. Past entries, awards, judge comments, and points render in the history section.
8. The member can update their address, phone, and email from My Profile, and cannot alter any other field.
9. Revoking a member's `member_history` token immediately locks them out of the portal (cookie no longer resolves).

---

## 9. Out of Scope (for now)

- Password-based member login (magic link + long-lived cookie covers it).
- Automated competition status transitions (staying manual by choice).
- Member-facing public leaderboard tab (candidate for a later portal tab).
- Bulk zip export, one-off email composer, scheduled subs reminders.
