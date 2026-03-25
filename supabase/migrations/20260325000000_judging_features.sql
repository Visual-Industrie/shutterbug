-- Feature: Judge Reference View — sort order for entries
ALTER TABLE entries ADD COLUMN sort_order integer;

-- Feature: Member Subscription / Payment Tracking
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year integer NOT NULL,
  amount numeric(8, 2),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  recorded_by uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_member ON payments (member_id);

-- Feature: Personalised Deadline Reminder Emails
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'deadline_reminder';

INSERT INTO email_templates (key, name, description, subject_template, body_html) VALUES

('deadline_reminder_none',
 'Deadline reminder — no entries yet',
 'Sent to members who have not submitted any entries yet. Available placeholders: [member_name], [competition_name], [closes_date], [submission_link], [submission_url].',
 'Don''t forget to enter – [competition_name]',
 '<p>Hi [member_name],</p>
<p>We noticed you haven''t submitted any entries yet for <strong>[competition_name]</strong>. There''s still time!</p>
<p>Entries close on <strong>[closes_date]</strong>.</p>
<p>[submission_link]</p>
<p>—<br>Wairarapa Camera Club</p>'
),

('deadline_reminder_partial',
 'Deadline reminder — partial entries',
 'Sent to members who have submitted some entries but still have slots remaining. Available placeholders: [member_name], [competition_name], [closes_date], [submission_link], [submission_url], [submitted_entries], [slots_remaining].',
 'You still have entry slots available – [competition_name]',
 '<p>Hi [member_name],</p>
<p>You''ve submitted entries for <strong>[competition_name]</strong> but still have <strong>[slots_remaining]</strong> slot(s) remaining.</p>
[submitted_entries]
<p>Entries close on <strong>[closes_date]</strong>. Why not make the most of it?</p>
<p>[submission_link]</p>
<p>—<br>Wairarapa Camera Club</p>'
),

('deadline_reminder_full',
 'Deadline reminder — full quota submitted',
 'Sent to members who have reached the maximum entries. Available placeholders: [member_name], [competition_name], [closes_date], [submission_link], [submission_url].',
 'Final check – [competition_name] closes [closes_date]',
 '<p>Hi [member_name],</p>
<p>You''ve submitted the maximum number of entries for <strong>[competition_name]</strong> — great work!</p>
<p>Please take a moment to review your entries before the deadline on <strong>[closes_date]</strong>.</p>
<p>[submission_link]</p>
<p>—<br>Wairarapa Camera Club</p>'
)

ON CONFLICT (key) DO NOTHING;
