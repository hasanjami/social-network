ALTER TABLE group_members
ADD COLUMN request_type TEXT CHECK(request_type IN ('invitation', 'join_request')) NOT NULL DEFAULT 'join_request';
