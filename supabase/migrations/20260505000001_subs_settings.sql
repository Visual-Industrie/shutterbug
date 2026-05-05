INSERT INTO settings (key, section, label, value, default_value, description)
VALUES
  ('subs_amount',   'SUBS', 'Annual subscription amount', '50.00',     '50.00',     'Amount charged for annual membership subscriptions'),
  ('subs_due_date', 'SUBS', 'Subscription due date',      '2027-04-30','2027-04-30','Date by which subscriptions must be paid each year')
ON CONFLICT (key) DO NOTHING;
