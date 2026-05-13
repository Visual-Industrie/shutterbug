Shutterbug → WordPress integration spec

Camera club competition gallery sync — spec for Claude Code

Overview

When a competition is closed in Shutterbug, all competition data (entries, grades, titles, feedback) is automatically pushed to a WordPress site as custom post types. WordPress stores everything locally and serves the gallery and competition schedule independently of Shutterbug's availability.

Goals
Automate gallery publishing — no manual uploads or copy-paste
WordPress operates standalone — no live dependency on Shutterbug or Google Drive APIs at display time
Backfill historical competitions from Shutterbug into WordPress
Display a dynamic competition schedule from stored post data
Thumbnails generated at upload time and stored in Google Drive for use across Shutterbug and WordPress
Architecture summary
Shutterbug (Node/Express/Postgres)
  └─ "Close competition" action
       └─ Packages JSON payload
            └─ HTTP POST → WordPress REST API endpoint
                 └─ WordPress plugin receives + stores data
                      ├─ CPT: competition
                      └─ CPT: competition_entry (linked to competition)
Part 1 — Shutterbug changes
1.1 Thumbnail generation on image upload

When a member uploads a competition entry photo, the upload workflow should:

Accept the original high-resolution image
Generate a thumbnail (recommended: longest edge 600px, JPEG, quality 80)
Upload the original to the competition's Google Drive folder
Upload the thumbnail to a thumbnails/ subfolder within the same Drive folder
Store both the image_url (full res) and thumbnail_url in the entry record in Postgres

Thumbnail generation should be handled server-side using sharp (Node.js). Do not rely on client-side resizing.

1.2 Competition close action — sync trigger

The existing "close competition" action should be extended to call a new service function syncCompetitionToWordPress(competitionId) after successfully closing the competition.

This function should:

Query the competition record and all associated entries (including grades, titles, feedback, member names, image URLs)
Package the data as a JSON payload (see section 1.3)
POST the payload to the configured WordPress REST API endpoint
Log the response (success or failure) — do not block the close action on WordPress sync failure

The WordPress endpoint URL and authentication token should be stored in environment variables:

WP_SYNC_ENDPOINT=https://yoursite.com/wp-json/shutterbug/v1/sync
WP_SYNC_SECRET=your_shared_secret_token
1.3 JSON payload structure
{
  "competition": {
    "shutterbug_id": "uuid",
    "name": "Autumn Tones",
    "theme": "Autumn Tones",
    "description": "Capture the colours and textures of the autumn season...",
    "open_date": "2025-03-01",
    "close_date": "2025-03-28",
    "judging_open_date": "2025-03-29",
    "judging_close_date": "2025-04-04",
    "meeting_date": "2025-04-08",
    "judge": {
      "name": "Jane Smith",
      "website": "https://janesmith.photography",
      "instagram": "https://instagram.com/janesmith",
      "facebook": null
    },
    "status": "closed"
  },
  "entries": [
    {
      "shutterbug_entry_id": "uuid",
      "member_name": "Alex Jones",
      "title": "Golden Hour on the Tararuas",
      "grade": "HC",
      "grade_label": "Highly Commended",
      "feedback": "Excellent use of golden light...",
      "image_url": "https://drive.google.com/...",
      "thumbnail_url": "https://drive.google.com/..."
    }
  ]
}
Grade labels mapping
Grade code	Display label
A	Accepted
HC	Highly Commended
C	Commended
1	First Place
2	Second Place
3	Third Place

Adjust grade codes and labels to match the actual values used in Shutterbug.

1.4 Backfill script

A standalone Node.js script scripts/backfill-wordpress.ts should iterate through all historical closed competitions and call syncCompetitionToWordPress() for each one. It should:

Process competitions in chronological order
Batch with a small delay between requests (e.g. 500ms) to avoid overloading WordPress
Log progress and any failures to the console
Be safe to re-run (WordPress plugin should upsert based on shutterbug_id, not create duplicates)
Part 2 — WordPress plugin
2.1 Plugin overview

Create a custom WordPress plugin named shutterbug-sync. It should register the custom post types, expose the REST API endpoint, and provide template functions for displaying competitions and galleries.

File structure:

wp-content/plugins/shutterbug-sync/
  shutterbug-sync.php        ← main plugin file
  includes/
    cpt-competition.php      ← competition CPT registration
    cpt-entry.php            ← entry CPT registration
    rest-endpoint.php        ← REST API endpoint
    sync-handler.php         ← processes incoming payload
  templates/
    competition-schedule.php ← schedule shortcode template
    competition-gallery.php  ← gallery shortcode template
2.2 Custom post type — competition

Register CPT with slug competition. Store all metadata as post meta fields:

Meta key	Type	Notes
shutterbug_id	string	UUID from Shutterbug — used for upsert matching
theme	string	Same as post title, stored separately for query convenience
description	text	Competition brief for members
open_date	date (Y-m-d)	
close_date	date (Y-m-d)	
judging_open_date	date (Y-m-d)	
judging_close_date	date (Y-m-d)	
meeting_date	date (Y-m-d)	Club meeting where results are presented
judge_name	string	
judge_website	string/url	Optional
judge_instagram	string/url	Optional
judge_facebook	string/url	Optional
status	string	open / closed / judging / complete
2.3 Custom post type — competition entry

Register CPT with slug competition_entry. Store all metadata as post meta fields:

Meta key	Type	Notes
shutterbug_entry_id	string	UUID from Shutterbug — used for upsert matching
competition_post_id	int	WP post ID of the parent competition
shutterbug_competition_id	string	Shutterbug UUID — stored for reference
member_name	string	
title	string	Image title as submitted by member
grade	string	Raw grade code (e.g. HC)
grade_label	string	Human-readable label (e.g. Highly Commended)
feedback	text	Judge feedback — stored but not necessarily displayed
image_url	string/url	Full-res Google Drive URL
thumbnail_url	string/url	Thumbnail Google Drive URL
2.4 REST API endpoint

Register a custom REST route:

POST /wp-json/shutterbug/v1/sync

Authentication: validate a shared secret token passed as a Bearer token in the Authorization header. Token stored in WordPress options as shutterbug_sync_secret.

On receiving a valid payload the endpoint should call sync_handler which:

Looks up any existing competition post with matching shutterbug_id
Creates or updates the competition post and all meta fields
For each entry in the payload, looks up existing entry by shutterbug_entry_id
Creates or updates each entry post, setting competition_post_id to link it to the parent
Returns a JSON response with counts of created/updated records

Response format:

{
  "success": true,
  "competition": "created|updated",
  "entries_created": 0,
  "entries_updated": 42
}
2.5 Competition schedule shortcode

Register shortcode [competition_schedule]. Queries all competition posts ordered by open_date ascending. Displays:

A table showing competition name, open date, close date, meeting date, and judge name
Each row is clickable/expandable (accordion) to reveal full details including description and judge social links
Past competitions shown separately or with a visual treatment to distinguish upcoming from past
Judge social links displayed as icon links (website, Instagram, Facebook) where present
2.6 Competition gallery shortcode

Register shortcode [competition_gallery id="shutterbug_id"]. Accepts either a Shutterbug competition UUID or a WordPress post ID. Queries all competition_entry posts linked to that competition. Displays:

Gallery grid using thumbnail URLs
Each image shows title, member name, and grade label on hover or below the image
Clicking an image opens the full-res version (lightbox or new tab — implementer's preference)
Feedback is stored but not rendered in the initial implementation — add a feature flag or admin toggle to enable it later
2.7 Plugin settings page

Add a simple settings page under Settings in WP admin to store:

Sync secret token (write-only field)
Optional: toggle to show/hide judge feedback in gallery shortcode
Part 3 — considerations and edge cases
Google Drive image access

Images are served directly from Google Drive URLs. Ensure the Drive folders/files are set to "anyone with the link can view" or the sharing is configured appropriately so WordPress visitors can load the images. If Drive access becomes a problem in future, consider migrating images into WP media library as a follow-up task.

Security
The sync endpoint must reject requests without a valid Bearer token
Rate limit or IP-restrict the endpoint if possible
Sanitise all incoming string fields before storing as post meta
Re-syncing

The sync is upsert-based — running it multiple times on the same competition should not create duplicate posts. Match on shutterbug_id / shutterbug_entry_id.

Timezone

All dates from Shutterbug should be sent as NZT (Pacific/Auckland) formatted strings (Y-m-d). WordPress should store and display them as-is without timezone conversion.