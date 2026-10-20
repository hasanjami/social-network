-- SQLite: recreate groups without privacy
CREATE TABLE groups_tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    creator_id INTEGER NOT NULL,
    img TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO groups_tmp (id, name, description, creator_id, img, created_at)
SELECT id, name, description, creator_id, img, created_at FROM groups;

DROP TABLE groups;
ALTER TABLE groups_tmp RENAME TO groups;
