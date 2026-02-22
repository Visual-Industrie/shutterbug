-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE membership_type AS ENUM ('full', 'life', 'complimentary');
CREATE TYPE experience_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE applicant_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE event_type AS ENUM ('competition', 'award', 'other');
CREATE TYPE entry_type AS ENUM ('projim', 'printim');
CREATE TYPE award_level AS ENUM ('honours', 'highly_commended', 'commended', 'accepted', 'winner', 'shortlisted');
CREATE TYPE token_type AS ENUM ('submission', 'judging', 'member_history');
CREATE TYPE admin_role AS ENUM ('president', 'competition_secretary', 'treasurer', 'committee', 'super_admin');
CREATE TYPE email_type AS ENUM (
  'submission_invite',
  'submission_reminder',
  'submission_confirmation',
  'judging_invite',
  'results_notification',
  'member_history_link',
  'subs_reminder',
  'one_off'
);

-- ─── Members ──────────────────────────────────────────────────────────────────

CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  membership_number TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  membership_type membership_type NOT NULL DEFAULT 'full',
  sub_status TEXT NOT NULL DEFAULT 'active',
  experience_level experience_level,
  annual_sub_amount NUMERIC(8,2),
  subs_paid BOOLEAN NOT NULL DEFAULT FALSE,
  subs_paid_date DATE,
  subs_paid_amount NUMERIC(8,2),
  subs_due_date DATE,
  payment_method TEXT,
  joined_date DATE,
  privacy_act_ok BOOLEAN NOT NULL DEFAULT FALSE,
  image_use_ok BOOLEAN NOT NULL DEFAULT FALSE,
  club_rules_ok BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Applicants ───────────────────────────────────────────────────────────────

CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  annual_sub_amount NUMERIC(8,2),
  pay_by_date DATE,
  status applicant_status NOT NULL DEFAULT 'pending',
  privacy_act_ok BOOLEAN NOT NULL DEFAULT FALSE,
  image_use_ok BOOLEAN NOT NULL DEFAULT FALSE,
  club_rules_ok BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applicants_status ON applicants(status);

-- ─── Seasons (calendar years, pre-populated 2019–2035) ───────────────────────

CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL UNIQUE,
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  is_current_event_year BOOLEAN NOT NULL DEFAULT FALSE,
  is_current_membership_year BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO seasons (year, starts_at, ends_at, is_current_event_year, is_current_membership_year) VALUES
  (2019, '2019-01-01', '2019-12-31', FALSE, FALSE),
  (2020, '2020-01-01', '2020-12-31', FALSE, FALSE),
  (2021, '2021-01-01', '2021-12-31', FALSE, FALSE),
  (2022, '2022-01-01', '2022-12-31', FALSE, FALSE),
  (2023, '2023-01-01', '2023-12-31', FALSE, FALSE),
  (2024, '2024-01-01', '2024-12-31', FALSE, FALSE),
  (2025, '2025-01-01', '2025-12-31', FALSE, TRUE),
  (2026, '2026-01-01', '2026-12-31', TRUE, FALSE),
  (2027, '2027-01-01', '2027-12-31', FALSE, FALSE),
  (2028, '2028-01-01', '2028-12-31', FALSE, FALSE),
  (2029, '2029-01-01', '2029-12-31', FALSE, FALSE),
  (2030, '2030-01-01', '2030-12-31', FALSE, FALSE),
  (2031, '2031-01-01', '2031-12-31', FALSE, FALSE),
  (2032, '2032-01-01', '2032-12-31', FALSE, FALSE),
  (2033, '2033-01-01', '2033-12-31', FALSE, FALSE),
  (2034, '2034-01-01', '2034-12-31', FALSE, FALSE),
  (2035, '2035-01-01', '2035-12-31', FALSE, FALSE);

-- ─── Competitions / Events ────────────────────────────────────────────────────

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  event_type event_type NOT NULL DEFAULT 'competition',
  name TEXT NOT NULL,
  description TEXT,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  judging_opens_at TIMESTAMPTZ,
  judging_closes_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  max_projim_entries INT NOT NULL DEFAULT 1,
  max_printim_entries INT NOT NULL DEFAULT 2,
  points_honours INT NOT NULL DEFAULT 6,
  points_highly_commended INT NOT NULL DEFAULT 4,
  points_commended INT NOT NULL DEFAULT 2,
  points_accepted INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Judges ───────────────────────────────────────────────────────────────────

CREATE TABLE judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  address TEXT,
  photo_drive_url TEXT,
  rating NUMERIC(2,1),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE competition_judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  judge_id UUID NOT NULL REFERENCES judges(id),
  UNIQUE(competition_id, judge_id)
);

-- ─── Tokens ───────────────────────────────────────────────────────────────────

CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
  type token_type NOT NULL,
  member_id UUID REFERENCES members(id),
  judge_id UUID REFERENCES judges(id),
  competition_id UUID REFERENCES competitions(id),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT token_has_valid_owner CHECK (
    (type = 'submission'     AND member_id IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'judging'        AND judge_id  IS NOT NULL AND competition_id IS NOT NULL) OR
    (type = 'member_history' AND member_id IS NOT NULL)
  )
);

CREATE INDEX idx_tokens_token ON tokens(token);
CREATE INDEX idx_tokens_member ON tokens(member_id);
CREATE INDEX idx_tokens_judge ON tokens(judge_id);

-- ─── Entries ──────────────────────────────────────────────────────────────────

CREATE TABLE entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  member_id UUID NOT NULL REFERENCES members(id),
  type entry_type NOT NULL,
  title TEXT NOT NULL,
  drive_file_id TEXT,
  drive_file_url TEXT,
  drive_thumbnail_url TEXT,
  award award_level,           -- NULL = not placed
  judge_comment TEXT,          -- HTML from TipTap
  judged_at TIMESTAMPTZ,
  judged_by UUID REFERENCES judges(id),
  points_awarded INT,          -- snapshot at time of judging
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entries_competition ON entries(competition_id);
CREATE INDEX idx_entries_member ON entries(member_id);

-- ─── Points Ledger ────────────────────────────────────────────────────────────

CREATE TABLE member_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  season_id UUID NOT NULL REFERENCES seasons(id),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  entry_id UUID NOT NULL REFERENCES entries(id),
  entry_type entry_type NOT NULL,
  points INT NOT NULL DEFAULT 0,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entry_id)
);

CREATE INDEX idx_member_points_member_season ON member_points(member_id, season_id);

-- ─── Admin Users ──────────────────────────────────────────────────────────────

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role admin_role NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Settings ─────────────────────────────────────────────────────────────────

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT,
  default_value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, section, label, value, default_value, description) VALUES
  ('COMP-Upload Limit PROJIM',   'COMP',      'Upload Limit PROJIM',   '1',                          '1',    'Max projected image entries per member per competition'),
  ('COMP-Upload Limit PRINTIM',  'COMP',      'Upload Limit PRINTIM',  '2',                          '2',    'Max printed image entries per member per competition'),
  ('COMP-First Reminder Days',   'COMP',      'First Reminder Days',   '-14',                        '-14',  'Days before close to send the first reminder'),
  ('COMP-Second Reminder Days',  'COMP',      'Second Reminder Days',  '-7',                         '-7',   'Days before close to send the final reminder'),
  ('COMP-Reminders',             'COMP',      'Reminders',             'true',                       'true', 'Whether competition reminder emails are sent automatically'),
  ('SUBS-First Reminder Date',   'SUBS',      'First Reminder Date',   '12-13',                      '12-13','MM-DD: date to send first subs renewal reminder'),
  ('SUBS-Second Reminder Date',  'SUBS',      'Second Reminder Date',  '01-13',                      '01-13','MM-DD: date to send second subs renewal reminder'),
  ('SUBS-Reminders',             'SUBS',      'Reminders',             'true',                       'true', 'Whether subs reminder emails are sent automatically'),
  ('SUBS-Grace Period End',      'SUBS',      'Grace Period End',      '04-01',                      '04-01','MM-DD: date subs grace period ends'),
  ('SUBS-Full First Half',       'SUBS',      'Full Subs (Jan–Jun)',   '50',                         '50',   'Full membership annual subs amount if joining Jan–Jun'),
  ('SUBS-Full Second Half',      'SUBS',      'Full Subs (Jul–Dec)',   '25',                         '25',   'Full membership annual subs amount if joining Jul–Dec'),
  ('CONFIG-ClubName',            'CONFIG',    'Club Name',             'Wairarapa Camera Club',      NULL,   'Club name used in emails and UI'),
  ('CONFIG-AdminEmail',          'CONFIG',    'Admin Email',           NULL,                         NULL,   'Default admin/system sender email address'),
  ('EMAILROLE-Competition Secretary', 'EMAILROLE', 'Competition Secretary Email', 'compsecwaicamc@gmail.com', NULL, 'Email address for competition secretary role'),
  ('EMAILROLE-Treasurer',        'EMAILROLE', 'Treasurer Email',       NULL,                         NULL,   'Email address for treasurer role'),
  ('EMAILROLE-President',        'EMAILROLE', 'President Email',       NULL,                         NULL,   'Email address for president role'),
  ('ADMIN-AGMDate',              'ADMIN',     'AGM Date',              NULL,                         NULL,   'Annual general meeting date (first Tuesday in August)');

-- ─── Email Log ────────────────────────────────────────────────────────────────

CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type email_type NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  member_id UUID REFERENCES members(id),
  judge_id UUID REFERENCES judges(id),
  competition_id UUID REFERENCES competitions(id),
  token_id UUID REFERENCES tokens(id),
  subject TEXT NOT NULL,
  body TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

CREATE INDEX idx_email_log_member ON email_log(member_id);
