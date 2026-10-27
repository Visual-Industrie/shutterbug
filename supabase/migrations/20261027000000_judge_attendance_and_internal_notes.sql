-- Judges say whether they'd judge in person or online (asked on the
-- availability form). NULL = not told us yet.
DO $$ BEGIN
  CREATE TYPE judge_attendance AS ENUM ('in_person', 'online');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- internal_notes: the competition secretary's private review of the judge,
-- alongside rating. Never shown to the judge.
ALTER TABLE judges
  ADD COLUMN IF NOT EXISTS attendance_preference judge_attendance,
  ADD COLUMN IF NOT EXISTS internal_notes        TEXT;
