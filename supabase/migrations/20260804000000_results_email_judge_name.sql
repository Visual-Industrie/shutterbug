-- Surface the judge's name in the results notification email.
--
-- The [results_table] placeholder now carries a per-entry judge attribution
-- underneath each comment. Two new placeholders are also available:
--   [judge_name]      – the judge(s) who scored the member's entries (bare name)
--   [judged_by_line]  – a ready-made "This competition was judged by …" line,
--                       which renders as nothing when no judge is on record.
-- Both fall back to the competition's assigned judge where an entry has no
-- judged_by recorded (e.g. entries imported from the old system).

UPDATE email_templates
SET description = 'Sent to each entrant when competition results are published. Available placeholders: [member_name], [competition_name], [judge_name], [judged_by_line], [results_table], [history_link], [history_url].'
WHERE key = 'results_notification';

-- Add the "judged by" line to the body, but only where the template is still
-- the untouched seeded default — never clobber a club-authored customisation.
UPDATE email_templates
SET body_html = $body$<p>Hi [member_name],</p>
<p>Results are in for <strong>[competition_name]</strong>!</p>
[judged_by_line]
[results_table]
<p>[history_link]</p>
<p>—<br>Wairarapa Camera Club</p>$body$
WHERE key = 'results_notification'
  AND body_html = $orig$<p>Hi [member_name],</p>
<p>Results are in for <strong>[competition_name]</strong>!</p>
[results_table]
<p>[history_link]</p>
<p>—<br>Wairarapa Camera Club</p>$orig$;
