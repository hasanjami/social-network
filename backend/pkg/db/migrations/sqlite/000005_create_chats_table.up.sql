    CREATE TABLE chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender INTEGER NOT NULL,
        receiver INTEGER,
        group_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        CHECK ((receiver IS NULL AND group_id IS NOT NULL) OR (receiver IS NOT NULL AND group_id IS NULL))
    );