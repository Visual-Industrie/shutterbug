INSERT INTO settings (key, section, label, value, default_value, description)
VALUES (
  'email_footer',
  'EMAIL',
  'Email footer',
  '<p>Do not reply to this email. To contact the Competition Secretary, use <a href="mailto:compsecwaicamc@gmail.com">compsecwaicamc@gmail.com</a>. All other committee email addresses are on our website.</p>',
  '<p>Do not reply to this email. To contact the Competition Secretary, use <a href="mailto:compsecwaicamc@gmail.com">compsecwaicamc@gmail.com</a>. All other committee email addresses are on our website.</p>',
  'Appended to every outgoing email (HTML)'
)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  default_value = EXCLUDED.default_value,
  description = EXCLUDED.description;
