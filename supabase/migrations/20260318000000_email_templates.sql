-- Email templates — admin-editable templates with [placeholder] syntax
CREATE TABLE email_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_id UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Seed defaults
INSERT INTO email_templates (key, name, description, subject_template, body_html) VALUES

('submission_invite',
 'Submission invite',
 'Sent to all active members when a competition opens for entries.',
 'Submit your entries – [competition_name]',
 $body$<p>Hi [member_name],</p>
<p>Entries are now open for <strong>[competition_name]</strong>.</p>
<p>Submissions close on <strong>[closes_date]</strong>.</p>
<p>[submission_link]</p>
<p>Or copy this link: [submission_url]</p>
<p>You can submit up to 1 projected image (PROJIM) and up to 2 printed images (PRINTIM).</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('submission_reminder',
 'Submission reminder',
 'Sent to all active members as a reminder before the competition closes.',
 'Reminder: entries close [closes_date] – [competition_name]',
 $body$<p>Hi [member_name],</p>
<p>Just a reminder that entries for <strong>[competition_name]</strong> close on <strong>[closes_date]</strong>.</p>
[entry_summary]
<p>[submission_link]</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('judging_invite',
 'Judging invite',
 'Sent to the assigned judge when a competition moves to judging status.',
 'Judge invitation – [competition_name]',
 $body$<p>Hi [judge_name],</p>
<p>You''ve been invited to judge <strong>[competition_name]</strong>.</p>
<p>There are <strong>[projim_count] projected</strong> and <strong>[printim_count] printed</strong> images to judge.</p>
<p>Please complete your judging by <strong>[judging_closes_date]</strong>.</p>
<p>[judging_link]</p>
<p>Or copy this link: [judging_url]</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('member_history_link',
 'Member history link',
 'Sent to a member when an admin shares their personal photo history link.',
 'Your Wairarapa Camera Club photo history',
 $body$<p>Hi [member_name],</p>
<p>Here''s your personal link to view all your competition entries and scores.</p>
<p>[history_link]</p>
<p>Or copy this link: [history_url]</p>
<p>This link is unique to you — please don''t share it.</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('results_notification',
 'Results notification',
 'Sent to each entrant when competition results are published.',
 'Results – [competition_name]',
 $body$<p>Hi [member_name],</p>
<p>Results are in for <strong>[competition_name]</strong>!</p>
[results_table]
<p>[history_link]</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('subs_reminder_first',
 'Subs reminder – 1st',
 'First subscription renewal reminder sent in December.',
 'Subscription renewal reminder – Wairarapa Camera Club',
 $body$<p>Hi [member_name],</p>
<p>This is a reminder that your Wairarapa Camera Club membership subscription of <strong>[amount]</strong> is due for renewal.</p>
<p>Please arrange payment at your earliest convenience. If you have any questions, reply to this email or contact the club treasurer.</p>
<p>—<br>Wairarapa Camera Club</p>$body$),

('subs_reminder_second',
 'Subs reminder – 2nd (final)',
 'Second and final subscription renewal reminder sent in January.',
 'Final reminder: subscription renewal – Wairarapa Camera Club',
 $body$<p>Hi [member_name],</p>
<p>This is a reminder that your Wairarapa Camera Club membership subscription of <strong>[amount]</strong> is due for renewal.</p>
<p><strong>This is your final reminder.</strong> Please pay as soon as possible to keep your membership active.</p>
<p>Please arrange payment at your earliest convenience. If you have any questions, reply to this email or contact the club treasurer.</p>
<p>—<br>Wairarapa Camera Club</p>$body$);
