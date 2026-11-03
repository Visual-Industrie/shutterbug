-- Judge and judging-deadline placeholders for every competition email template.
--
-- Available in the submission invite, submission reminder, deadline reminders
-- (none / partial / full), judging invite and results notification:
--   [judging_closes_date] – when judging closes ("TBA" if not set)
--   [judge_name]          – the competition's judge(s) (blank if none assigned)
--   [judge_bio]           – the judge's bio (blank if none)
--   [judge_links]         – the judge's website / Facebook / Instagram links
--   [judge_profile]       – ready-made block combining name, bio and links
--
-- Only the template descriptions change here. Template bodies are left alone so
-- any club-authored customisation is never clobbered.

UPDATE email_templates
SET description = description || ' Also available: [judging_closes_date], [judge_name], [judge_bio], [judge_links], [judge_profile].'
WHERE key IN (
    'submission_invite',
    'submission_reminder',
    'deadline_reminder_none',
    'deadline_reminder_partial',
    'deadline_reminder_full',
    'judging_invite',
    'results_notification'
  )
  AND description IS NOT NULL
  AND description NOT LIKE '%[judge_profile]%';
