-- Configurable envelope addresses for outgoing mail.
--
--   email_bulk_to  – the visible "To" on a BCC'd group send. Previously the
--                    noreply from-address, which has no mailbox behind it;
--                    the Competition Secretary is a better default.
--   email_reply_to – Reply-To on EVERY outgoing email, so replies reach a
--                    human instead of bouncing off noreply@.
--
-- Both are overridable per-send from the email composer.

INSERT INTO settings (key, section, label, value, default_value, description)
VALUES
  (
    'email_bulk_to',
    'EMAIL',
    'Bulk email "To" address',
    NULL,
    'compsecwaicamc@gmail.com',
    'The address shown in the To field when emailing a group. Members are BCC''d, so this is the only visible recipient. Can be changed per send.'
  ),
  (
    'email_reply_to',
    'EMAIL',
    'Reply-to address',
    NULL,
    'compsecwaicamc@gmail.com',
    'Where replies go for all outgoing email, including automated messages. Can be changed per send from the composer.'
  )
ON CONFLICT (key) DO NOTHING;
