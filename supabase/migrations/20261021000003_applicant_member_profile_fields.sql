-- Carry every /join field through to the member record, and let members edit
-- their own details in the portal.

-- applicants.experience_level was added as plain text; align it with the
-- members column. The form only ever sends enum values, so anything else
-- (there should be nothing) becomes NULL rather than failing the cast.
ALTER TABLE applicants
  ALTER COLUMN experience_level TYPE experience_level USING (
    CASE WHEN experience_level IN ('beginner', 'intermediate', 'advanced')
      THEN experience_level::experience_level
    END
  );

-- When each consent was given. Left NULL for existing rows — we don't know.
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS privacy_act_consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_use_consented_at   TIMESTAMPTZ;

-- Application fields that are ongoing member attributes.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS landline                 TEXT,
  ADD COLUMN IF NOT EXISTS photographic_interests   TEXT,
  ADD COLUMN IF NOT EXISTS software                 TEXT,
  ADD COLUMN IF NOT EXISTS privacy_act_consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_use_consented_at   TIMESTAMPTZ;

-- The member history link email now leads to a portal where members can also
-- update their details. Only touch the template if it's still the seeded default.
UPDATE email_templates
SET name = 'Member portal link',
    description = 'Sent to a member with their personal portal link (photo history and their details). Available placeholders: [member_name], [history_link], [history_url].'
WHERE key = 'member_history_link';

UPDATE email_templates
SET subject_template = 'Your Wairarapa Camera Club membership',
    body_html = $body$<p>Hi [member_name],</p>
<p>Here's your personal link to your membership page. You can view all your competition entries and scores, and keep your contact details up to date.</p>
<p>[history_link]</p>
<p>Or copy this link: [history_url]</p>
<p>This link is unique to you — please don't share it.</p>
<p>—<br>Wairarapa Camera Club</p>$body$
WHERE key = 'member_history_link'
  AND subject_template = 'Your Wairarapa Camera Club photo history'
  AND body_html = $orig$<p>Hi [member_name],</p>
<p>Here's your personal link to view all your competition entries and scores.</p>
<p>[history_link]</p>
<p>Or copy this link: [history_url]</p>
<p>This link is unique to you — please don't share it.</p>
<p>—<br>Wairarapa Camera Club</p>$orig$;
