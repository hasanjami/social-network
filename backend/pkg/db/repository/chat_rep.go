package repository

import (
	"database/sql"
	"time"

	"backend/pkg/models"
)

type ChatRepository struct {
	db *sql.DB
}

func NewChatRepository(db *sql.DB) *ChatRepository {
	return &ChatRepository{db: db}
}

func (r *ChatRepository) SaveMessage(senderID int, receiverID *int, groupID *int, content string) (*models.ChatMessage, error) {
	createdAt := time.Now()
	result, err := r.db.Exec(`
		INSERT INTO chats (sender, receiver, group_id, content, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, senderID, receiverID, groupID, content, createdAt)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.ChatMessage{
		ID:         int(id),
		SenderID:   senderID,
		ReceiverID: receiverID,
		GroupID:    groupID,
		Content:    content,
		CreatedAt:  createdAt,
	}, nil
}

func (r *ChatRepository) GetPrivateMessages(userA, userB, limit, offset int) ([]*models.ChatMessage, error) {
	rows, err := r.db.Query(`
		SELECT id, sender, receiver, group_id, content, created_at
		FROM chats
		WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
		AND group_id IS NULL
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, userA, userB, userB, userA, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*models.ChatMessage
	for rows.Next() {
		var m models.ChatMessage
		var createdAtStr string
		err := rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.GroupID, &m.Content, &createdAtStr)
		if err != nil {
			return nil, err
		}
		m.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		messages = append(messages, &m)
	}

	return messages, nil
}

func (r *ChatRepository) GetGroupMessages(groupID, limit, offset int) ([]*models.ChatMessage, error) {
	rows, err := r.db.Query(`
		SELECT id, sender, receiver, group_id, content, created_at
		FROM chats
		WHERE group_id = ?
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, groupID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*models.ChatMessage
	for rows.Next() {
		var m models.ChatMessage
		var createdAtStr string
		err := rows.Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.GroupID, &m.Content, &createdAtStr)
		if err != nil {
			return nil, err
		}
		m.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		messages = append(messages, &m)
	}

	return messages, nil
}

func (r *ChatRepository) GetPrivateConversations(userID int) ([]int, error) {
	rows, err := r.db.Query(`
		SELECT DISTINCT
			CASE WHEN sender = ? THEN receiver ELSE sender END AS other_id
		FROM chats
		WHERE (sender = ? OR receiver = ?) AND group_id IS NULL
	`, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, nil
}

func (r *ChatRepository) GetGroupConversations(userID int) ([]int, error) {
	rows, err := r.db.Query(`
		SELECT group_id FROM group_members
		WHERE user_id = ? AND status = 'accepted'
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, nil
}

func (r *ChatRepository) GetLastPrivateMessage(userA, userB int) (*models.ChatMessage, error) {
	var m models.ChatMessage
	var createdAtStr string
	err := r.db.QueryRow(`
		SELECT id, sender, receiver, group_id, content, created_at
		FROM chats
		WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
		AND group_id IS NULL
		ORDER BY created_at DESC LIMIT 1
	`, userA, userB, userB, userA).Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.GroupID, &m.Content, &createdAtStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	m.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &m, nil
}

func (r *ChatRepository) GetLastGroupMessage(groupID int) (*models.ChatMessage, error) {
	var m models.ChatMessage
	var createdAtStr string
	err := r.db.QueryRow(`
		SELECT id, sender, receiver, group_id, content, created_at
		FROM chats
		WHERE group_id = ?
		ORDER BY created_at DESC LIMIT 1
	`, groupID).Scan(&m.ID, &m.SenderID, &m.ReceiverID, &m.GroupID, &m.Content, &createdAtStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	m.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &m, nil
}

func (r *ChatRepository) AddChatNotify(chatID, recipientID int) error {
	_, err := r.db.Exec(`
		INSERT INTO chat_notify (chat_id, recipient_id)
		VALUES (?, ?)
	`, chatID, recipientID)
	return err
}

func (r *ChatRepository) ClearChatNotify(recipientID, senderID int) error {
	_, err := r.db.Exec(`
		DELETE FROM chat_notify
		WHERE recipient_id = ? AND chat_id IN (
			SELECT id FROM chats WHERE sender = ? AND receiver = ?
		)
	`, recipientID, senderID, recipientID)
	return err
}

func (r *ChatRepository) ClearGroupChatNotify(recipientID, groupID int) error {
	_, err := r.db.Exec(`
		DELETE FROM chat_notify
		WHERE recipient_id = ? AND chat_id IN (
			SELECT id FROM chats WHERE group_id = ?
		)
	`, recipientID, groupID)
	return err
}

func (r *ChatRepository) CountUnread(recipientID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM chat_notify WHERE recipient_id = ?
	`, recipientID).Scan(&count)
	return count, err
}

func (r *ChatRepository) CountConversationUnread(recipientID, senderID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM chat_notify cn
		JOIN chats c ON cn.chat_id = c.id
		WHERE cn.recipient_id = ? AND c.sender = ?
	`, recipientID, senderID).Scan(&count)
	return count, err
}

func (r *ChatRepository) CountGroupUnread(recipientID, groupID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM chat_notify cn
		JOIN chats c ON cn.chat_id = c.id
		WHERE cn.recipient_id = ? AND c.group_id = ?
	`, recipientID, groupID).Scan(&count)
	return count, err
}
