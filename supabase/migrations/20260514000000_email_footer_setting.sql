INSERT INTO settings (key, section, label, value, default_value, description)
VALUES (
  'email_footer',
  'EMAIL',
  'Email footer',
  'Do not reply to this email. To contact the Competition Secretary, use compsecwaicamc@gmail.com. All other committee email addresses are on our website.',
  'Do not reply to this email. To contact the Competition Secretary, use compsecwaicamc@gmail.com. All other committee email addresses are on our website.',
  'Appended to every outgoing email'
)
ON CONFLICT (key) DO NOTHING;
