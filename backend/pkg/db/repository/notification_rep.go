package repository

import (
	"database/sql"
	"time"

	"backend/pkg/models"
)

type NotificationRepository struct {
	db *sql.DB
}

func NewNotificationRepository(db *sql.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

func (r *NotificationRepository) Create(recipientID, senderID, objectID int, notifType, content string) error {
	_, err := r.db.Exec(`
		INSERT OR IGNORE INTO notifications (recipient_id, sender_id, object_id, type, content, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, recipientID, senderID, objectID, notifType, content, time.Now())
	return err
}

func (r *NotificationRepository) GetByUserID(userID int) ([]*models.Notification, error) {
	rows, err := r.db.Query(`
		SELECT id, recipient_id, sender_id, object_id, type, content, is_read, created_at
		FROM notifications
		WHERE recipient_id = ?
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []*models.Notification
	for rows.Next() {
		var n models.Notification
		var createdAtStr string

		err := rows.Scan(&n.ID, &n.RecipientID, &n.SenderID, &n.ObjectID, &n.Type, &n.Content, &n.IsRead, &createdAtStr)
		if err != nil {
			return nil, err
		}

		n.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		notifications = append(notifications, &n)
	}

	return notifications, nil
}

func (r *NotificationRepository) MarkAsRead(notifID, userID int) error {
	_, err := r.db.Exec(`
		UPDATE notifications SET is_read = TRUE
		WHERE id = ? AND recipient_id = ?
	`, notifID, userID)
	return err
}

func (r *NotificationRepository) MarkAllAsRead(userID int) error {
	_, err := r.db.Exec(`
		UPDATE notifications SET is_read = TRUE
		WHERE recipient_id = ?
	`, userID)
	return err
}

func (r *NotificationRepository) CountUnread(userID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM notifications
		WHERE recipient_id = ? AND is_read = FALSE
	`, userID).Scan(&count)
	return count, err
}

func (r *NotificationRepository) Delete(recipientID, senderID int, notifType string) error {
	_, err := r.db.Exec(`
		DELETE FROM notifications
		WHERE recipient_id = ? AND sender_id = ? AND type = ?
	`, recipientID, senderID, notifType)
	return err
}
