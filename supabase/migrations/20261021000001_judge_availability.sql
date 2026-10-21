-- Judge availability round: an annual email asking every judge whether they
-- want to stay on the list and which of next season's unjudged competitions
-- they'd like to judge, in order of preference.

-- ── Archive judges instead of deleting them ─────────────────────────────────
-- entries.judged_by references judges, so a hard delete would break history.
ALTER TABLE judges ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE judges ADD COLUMN archived_reason TEXT;

-- ── Tokens: per judge, per season ───────────────────────────────────────────
ALTER TABLE tokens ADD COLUMN season_id UUID REFERENCES seasons(id);

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS token_has_valid_owner;
ALTER TABLE tokens ADD CONSTRAINT token_has_valid_owner CHECK (
  (type = 'submission'         AND member_id IS NOT NULL AND competition_id IS NOT NULL) OR
  (type = 'judging'            AND judge_id  IS NOT NULL AND competition_id IS NOT NULL) OR
  (type = 'member_history'     AND member_id IS NOT NULL) OR
  (type = 'judge_availability' AND judge_id  IS NOT NULL AND season_id IS NOT NULL)
);

-- One live availability link per judge per season, so a resend reuses it.
CREATE UNIQUE INDEX uq_tokens_judge_availability
  ON tokens (judge_id, season_id)
  WHERE type = 'judge_availability' AND revoked_at IS NULL;

-- ── Responses: one per judge per season ─────────────────────────────────────
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

-- Ranked competition preferences (only for response = 'keen'); rank 1 = first choice.
CREATE TABLE judge_competition_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES judge_availability_responses(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  rank INT NOT NULL CHECK (rank >= 1),
  UNIQUE (response_id, competition_id),
  UNIQUE (response_id, rank)
);

CREATE INDEX idx_jcp_competition ON judge_competition_preferences (competition_id);

-- All data access goes through /api (see 20261014000000_enable_rls.sql).
ALTER TABLE judge_availability_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_competition_preferences ENABLE ROW LEVEL SECURITY;

-- ── Email templates ─────────────────────────────────────────────────────────
INSERT INTO email_templates (key, name, description, subject_template, body_html) VALUES

('judge_availability_invite',
 'Judge availability – invite',
 'Sent to every judge on the list, asking whether they want to stay on it and which of next season''s competitions they''d like to judge.',
 'Wairarapa Camera Club – judging for the [season_year] season',
 $body$<p>Kia ora [first_name],</p>
<p>You're on the Wairarapa Camera Club's list of judges – thank you for being part of it. We currently have you listed as <strong>[current_status]</strong>.</p>
<p>This email is twofold:</p>
<ol>
<li><strong>Would you like to stay on our judges list?</strong></li>
<li><strong>Which, if any, of our [season_year] competitions would you be interested in judging?</strong></li>
</ol>
<p>The competitions still needing a judge are below. Please let us know by <strong>[deadline_date]</strong> using your personal link:</p>
<p>[response_link]</p>
[competition_list]
<p>You can come back to the link and change your response any time before [deadline_date].</p>
<p>Ngā mihi,<br>Wairarapa Camera Club</p>$body$),

('judge_availability_reminder',
 'Judge availability – reminder',
 'Sent to judges who haven''t yet responded to the availability request.',
 'Reminder: judging for the [season_year] season',
 $body$<p>Kia ora [first_name],</p>
<p>Just a quick reminder – we haven't heard back from you yet about judging for our [season_year] season.</p>
<p>We currently have you listed as <strong>[current_status]</strong>. Could you let us know by <strong>[deadline_date]</strong> whether you'd like to stay on our judges list, and which competitions (if any) you'd be interested in judging?</p>
<p>[response_link]</p>
[competition_list]
<p>Ngā mihi,<br>Wairarapa Camera Club</p>$body$),

('judge_availability_confirmation',
 'Judge availability – confirmation',
 'Sent to a judge each time they save their availability response.',
 'Thanks – your judging response for [season_year]',
 $body$<p>Kia ora [first_name],</p>
[response_summary]
<p>Changed your mind? You can update your response any time before <strong>[deadline_date]</strong>:</p>
<p>[response_link]</p>
<p>Ngā mihi,<br>Wairarapa Camera Club</p>$body$),

('judge_availability_admin_notice',
 'Judge availability – judge removed',
 'Sent to the super admin and competition secretary when a judge asks to be removed from the list.',
 'Judge removed themselves: [judge_name]',
 $body$<p><strong>[judge_name]</strong> ([judge_email]) has asked to be removed from the judges list in response to the [season_year] availability request.</p>
<p>They've been archived in Shutterbug. They can undo this using their link until [deadline_date].</p>
<p>[judges_link]</p>$body$)

ON CONFLICT (key) DO NOTHING;
