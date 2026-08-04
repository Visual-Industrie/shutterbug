-- Group ("bulk") emails are now sent as a single BCC'd message rather than one
-- message per member. To keep the audit trail intact, email_log records both:
--
--   * one SUMMARY row per message actually handed to Resend, carrying the
--     recipient_count and any send error, and
--   * one CHILD row per member, pointing at its summary via batch_id.
--
-- Child rows preserve the per-member member_id link (and per-recipient search)
-- that the old one-send-per-member behaviour gave us. The log UI lists summary
-- rows and nests children underneath.

ALTER TABLE email_log
  ADD COLUMN batch_id uuid REFERENCES email_log(id) ON DELETE CASCADE,
  ADD COLUMN recipient_count integer;

-- Listing the log means "all rows that are not a child of a batch", so this
-- partial index backs the common case.
CREATE INDEX idx_email_log_batch ON email_log (batch_id) WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN email_log.batch_id IS
  'Set on per-member child rows; points at the summary row for the single BCC''d send that covered them. NULL for ordinary one-to-one emails and for summary rows themselves.';
COMMENT ON COLUMN email_log.recipient_count IS
  'Set on summary rows only: how many members were BCC''d on that send.';
