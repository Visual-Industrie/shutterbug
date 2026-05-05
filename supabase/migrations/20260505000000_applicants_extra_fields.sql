ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS address            text,
  ADD COLUMN IF NOT EXISTS landline           text,
  ADD COLUMN IF NOT EXISTS experience_level  text,
  ADD COLUMN IF NOT EXISTS facebook_invite   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method    text,
  ADD COLUMN IF NOT EXISTS photographic_interests text,
  ADD COLUMN IF NOT EXISTS software          text,
  ADD COLUMN IF NOT EXISTS hear_about_us     text,
  ADD COLUMN IF NOT EXISTS known_members     boolean NOT NULL DEFAULT false;
