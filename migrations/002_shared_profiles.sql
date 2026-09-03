ALTER TABLE participants ADD COLUMN avatar_image TEXT;

UPDATE participants SET is_admin = 0;

DROP INDEX IF EXISTS one_admin_per_room;
