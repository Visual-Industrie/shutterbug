-- DESTRUCTIVE: drops applicants.facebook_invite. The /join form never asked
-- the question — every row is the hard-coded `false` — so no real data is lost.
-- Separate from the additive profile-fields migration so it can be skipped.
ALTER TABLE applicants DROP COLUMN IF EXISTS facebook_invite;
