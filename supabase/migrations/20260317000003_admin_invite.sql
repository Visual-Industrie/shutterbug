-- Allow password_hash to be NULL while account is pending invite acceptance
ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;

-- Link admin_users to members (for committee members granted login access)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- One-time invite token
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
