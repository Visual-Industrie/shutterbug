UPDATE email_templates SET
  body_html = '<p>Hi [member_name],</p>
<p>You''ve submitted the maximum number of images allowed for <strong>[competition_name]</strong> — great work!</p>
<p>Don''t forget you can review, remove and resubmit images up until the competition close deadline on <strong>[closes_date]</strong>.</p>
<p>[submission_link]</p>
<p>—<br>Wairarapa Camera Club</p>'
WHERE key = 'deadline_reminder_full';
