-- Fix drive_file_url to use direct image URL instead of webViewLink
-- Old format: https://drive.google.com/file/d/{id} (HTML page, not usable as <img> src)
-- New format: https://drive.google.com/uc?export=view&id={id} (direct image URL)
UPDATE entries
SET drive_file_url = 'https://drive.google.com/uc?export=view&id=' || drive_file_id
WHERE drive_file_id IS NOT NULL
  AND drive_file_url NOT LIKE '%uc?export=view%';
