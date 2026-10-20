-- SQLite does not support dropping a column directly.
-- Recreate the table without request_type.
CREATE TABLE group_members_tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    inviter_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('pending', 'accepted')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
);

INSERT INTO group_members_tmp (id, group_id, user_id, inviter_id, status, created_at)
SELECT id, group_id, user_id, inviter_id, status, created_at
FROM group_members;

DROP TABLE group_members;
ALTER TABLE group_members_tmp RENAME TO group_members;
