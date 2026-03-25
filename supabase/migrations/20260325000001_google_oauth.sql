-- Singleton table for storing Google OAuth tokens
-- Only ever one row (id = 1), managed via admin settings UI
CREATE TABLE google_oauth_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  refresh_token text NOT NULL,
  email text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
