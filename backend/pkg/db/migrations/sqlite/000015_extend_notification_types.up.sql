PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS check_notification;
DROP TRIGGER IF EXISTS check_notification_post;
DROP TRIGGER IF EXISTS check_notification_event;
DROP TRIGGER IF EXISTS check_notification_follow;

CREATE TABLE notifications_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    object_id INTEGER NOT NULL,
    type TEXT CHECK(type IN (
        'follow_request', 'group_invitation', 'group_join_request',
        'event_creation', 'follow', 'post', 'reaction', 'comment', 'group',
        'group_invitation_accepted', 'group_invitation_declined',
        'group_join_accepted', 'group_join_declined'
    )) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(recipient_id, type, object_id)
);

INSERT INTO notifications_new SELECT * FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

PRAGMA foreign_keys = ON;

CREATE INDEX idx_notifications_type_object_id ON notifications(type, object_id);

CREATE TRIGGER check_notification
BEFORE INSERT ON notifications
FOR EACH ROW
WHEN NEW.type IN (
    'group_invitation', 'group_join_request', 'group',
    'group_invitation_accepted', 'group_invitation_declined',
    'group_join_accepted', 'group_join_declined'
)
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM groups WHERE id = NEW.object_id)
        THEN RAISE(ABORT, 'Invalid group_id')
    END;
END;

CREATE TRIGGER check_notification_post
BEFORE INSERT ON notifications
FOR EACH ROW
WHEN NEW.type = 'post'
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM posts WHERE id = NEW.object_id)
        THEN RAISE(ABORT, 'Invalid post_id')
    END;
END;

CREATE TRIGGER check_notification_event
BEFORE INSERT ON notifications
FOR EACH ROW
WHEN NEW.type = 'event_creation'
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.object_id)
        THEN RAISE(ABORT, 'Invalid event_id')
    END;
END;

CREATE TRIGGER check_notification_follow
BEFORE INSERT ON notifications
FOR EACH ROW
WHEN NEW.type IN ('follow', 'follow_request')
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.object_id)
        THEN RAISE(ABORT, 'Invalid user_id')
    END;
END;
