-- Add competition points default settings rows
INSERT INTO settings (key, section, label, value, default_value, description) VALUES
  ('COMP-Points Honours',          'COMP', 'Points: Honours',          '6', '6', 'Default points awarded for an Honours result'),
  ('COMP-Points Highly Commended', 'COMP', 'Points: Highly Commended', '4', '4', 'Default points awarded for a Highly Commended result'),
  ('COMP-Points Commended',        'COMP', 'Points: Commended',        '2', '2', 'Default points awarded for a Commended result'),
  ('COMP-Points Accepted',         'COMP', 'Points: Accepted',         '1', '1', 'Default points awarded for an Accepted result')
ON CONFLICT (key) DO NOTHING;
