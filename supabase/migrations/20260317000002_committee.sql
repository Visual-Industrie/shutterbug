-- Committee roles lookup table
CREATE TABLE committee_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_officer BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO committee_roles (name, is_officer, sort_order) VALUES
  ('President',             TRUE,  1),
  ('Secretary',             TRUE,  2),
  ('Treasurer',             TRUE,  3),
  ('Competition Secretary', TRUE,  4),
  ('Committee Member',      FALSE, 10);

-- Committee membership records (current + historical)
CREATE TABLE committee_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID REFERENCES members(id) ON DELETE SET NULL,
  role_id    UUID NOT NULL REFERENCES committee_roles(id),
  starts_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at    DATE,          -- NULL = currently in role
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_committee_members_member ON committee_members(member_id);
CREATE INDEX idx_committee_members_role   ON committee_members(role_id);
