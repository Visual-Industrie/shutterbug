-- Judges can leave optional comments with their availability response
-- (any of the three options). NULL = none given.
ALTER TABLE judge_availability_responses
  ADD COLUMN IF NOT EXISTS comments TEXT;

-- Put the judge's comments into the "judge removed" notice, just above the
-- button. Only touches the template if it doesn't already use the placeholder;
-- if the button line has been edited away, the placeholder goes on the end.
UPDATE email_templates
SET body_html = CASE
      WHEN body_html LIKE '%<p>[judges_link]</p>%'
        THEN replace(body_html, '<p>[judges_link]</p>', E'[judge_comments]\n<p>[judges_link]</p>')
      ELSE body_html || E'\n[judge_comments]'
    END
WHERE key = 'judge_availability_admin_notice'
  AND body_html NOT LIKE '%[judge_comments]%';
