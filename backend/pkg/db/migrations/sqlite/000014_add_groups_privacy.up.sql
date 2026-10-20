ALTER TABLE groups
ADD COLUMN privacy TEXT CHECK (privacy IN ('public', 'private')) NOT NULL DEFAULT 'public';
