-- New email_type values for the membership-application flow.
-- Kept in their own migration: ADD VALUE must be committed before the value
-- can be used at runtime (email_log inserts).
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'new_application';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'application_received';
