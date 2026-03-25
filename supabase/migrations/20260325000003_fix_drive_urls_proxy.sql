-- Rewrite drive_file_url from Google's direct URL to the Cloudflare Worker proxy
-- Old: https://drive.google.com/uc?export=view&id={fileId}
-- New: https://shutterbug-drive-proxy.web-bfb.workers.dev/{fileId}
UPDATE entries
SET drive_file_url = 'https://shutterbug-drive-proxy.web-bfb.workers.dev/' || drive_file_id
WHERE drive_file_id IS NOT NULL
  AND drive_file_url NOT LIKE 'https://shutterbug-drive-proxy.web-bfb.workers.dev/%';
