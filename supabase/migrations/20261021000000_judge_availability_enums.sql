-- New enum values for the judge availability round.
-- Kept in their own migration: ADD VALUE must be committed before the value
-- can be used (token inserts, email_log inserts, the CHECK constraint below).
ALTER TYPE token_type ADD VALUE IF NOT EXISTS 'judge_availability';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_invite';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_reminder';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_confirmation';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'judge_availability_admin_notice';
