-- New email type for the "your email was changed" notice sent to a member's
-- old address when they change it in the portal. Kept in its own migration:
-- ADD VALUE must be committed before the value can be used.
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'member_details_changed';
