# Shutterbug – Feature Spec

## 1. Manual Entry Management (Competition Secretary)

**Feature:** Competition secretary can manually add or edit entries on behalf of members.

**Implementation:**
- Reuse the existing member add/edit entry component
- Open it in a modal from the event management view
- Add a **member selector** input to the component (only visible when opened by an admin role)
- "Add Entry Manually" button on the event management view opens the modal
- Existing entries show a view modal with an **Edit** button that also opens the same component

**Rules enforcement:**
- When adding manually, the system must still enforce per-member entry limits (max prints and max projected images) for that event — same validation as the member-facing flow

**Permissions:** Competition Secretary, President, Super Admin

---

## 2. Personalised Deadline Reminder Emails

**Feature:** Send reminder emails to members about open competitions, personalised based on their entry status.

**Email logic:**
- **No entries yet** → encouraging message prompting them to submit
- **Partial entries** → show what they've submitted and how many slots remain
- **Full quota** → ask them to review their entries before the deadline

**Implementation:**
- Build as a manually triggered action first (button in the event management view)
- Automate on a schedule later once manual flow is confirmed working
- Build each of the emails as a templated email as per the rest of the emails in the system

**Permissions:** Competition Secretary, President, Super Admin

---

## 3. Member Subscription / Payment Tracking

**Feature:** Replace the binary paid/unpaid flag with a full payment history log.

**Data model changes:**
- Deprecate simple `paid` boolean
- Add a `payments` table (or equivalent) linked to member + subscription year
  - `member_id`
  - `year`
  - `amount` (optional)
  - `payment_date` (editable, defaults to today)
  - `recorded_by`
  - `created_at`

**UI:**
- Treasurer can mark a payment as received — defaults to today's date but can be manually edited (e.g. to backdate)
- Payment history visible per member, showing year-by-year log

**Permissions:** Treasurer, Club Secretary, President, Super Admin

---

## 4. Judge Reference View

**Feature:** A clean, mobile-friendly judge view for use during live judging nights. Print stylesheet also required.

**Layout:**
- Card-based layout, one entry per card
- Each card shows: thumbnail image, entry title, member name
- Read-only — no scoring or interaction required, purely for reference during verbal feedback

**Entry order:**
- Entries display in the same sequence as the projector/download order
- Judges can reorder entries up until a configurable cutoff time (e.g. 24 hours or 6 hours before judging)
- After cutoff, order is **locked** — no further changes permitted
- Locked order is used for sequential image download/export for the projector

**Print view:**
- Print stylesheet formats the same data cleanly on paper — large readable text, thumbnails included

**Permissions:** Judge (read-only), Competition Secretary, President, Super Admin