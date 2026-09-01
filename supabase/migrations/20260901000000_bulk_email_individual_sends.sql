-- Group emails now go out as one separately addressed message per member rather
-- than a single BCC'd send: Gmail rate-limited the club's sending domain
-- (421-4.7.28) when it saw one identical message fanned out to the whole
-- membership at once. email_bulk_to is no longer the visible To on that
-- message — it now just receives a copy for the club's records.

UPDATE settings
SET label = 'Group email club copy address',
    description = 'Group sends go out as a separate email per member, each addressed only to that member. This address also receives a copy for the club''s records. Can be changed per send.'
WHERE key = 'email_bulk_to';
