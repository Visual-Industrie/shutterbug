-- Store member postal/street address (legal requirement for club records).
-- Single free-text column matching the source WCCDatabase "StreetAddress" field
-- and the existing judges/applicants address convention.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS address text;
