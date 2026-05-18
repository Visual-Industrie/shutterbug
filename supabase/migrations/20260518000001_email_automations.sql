CREATE TABLE email_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,
  days_before integer,
  action text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES email_automations(id) ON DELETE CASCADE,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  fired_at timestamptz NOT NULL DEFAULT now(),
  result jsonb,
  UNIQUE (automation_id, competition_id)
);

INSERT INTO email_automations (trigger, days_before, action, label) VALUES
  ('competition_opens',       NULL, 'submission_invites',  'Send submission invites when competition opens'),
  ('before_competition_closes', 7,  'deadline_reminders',  'Send deadline reminders 7 days before close');
