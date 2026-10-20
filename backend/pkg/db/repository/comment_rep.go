package repository

import (
	"database/sql"
	"errors"
	"time"

	"backend/pkg/models"
)

type CommentRepository struct {
	db *sql.DB
}

func NewCommentRepository(db *sql.DB) *CommentRepository {
	return &CommentRepository{db: db}
}

func (r *CommentRepository) CreateComment(postID, userID int, content string, img *string) (*models.Comment, error) {
	createdAt := time.Now()
	result, err := r.db.Exec(`
		INSERT INTO comments (post_id, user_id, content, img, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, postID, userID, content, img, createdAt)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.Comment{
		ID:        int(id),
		PostID:    postID,
		UserID:    userID,
		Content:   content,
		Image:     img,
		CreatedAt: createdAt,
	}, nil
}

func (r *CommentRepository) GetCommentsByPostID(postID int) ([]*models.Comment, error) {
	rows, err := r.db.Query(`
		SELECT id, post_id, user_id, content, img, created_at
		FROM comments
		WHERE post_id = ?
		ORDER BY created_at ASC
	`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*models.Comment
	for rows.Next() {
		var c models.Comment
		var createdAtStr string

		err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.Content, &c.Image, &createdAtStr)
		if err != nil {
			return nil, err
		}

		c.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		comments = append(comments, &c)
	}

	return comments, nil
}

func (r *CommentRepository) DeleteComment(commentID, userID int) error {
	var ownerID int
	err := r.db.QueryRow("SELECT user_id FROM comments WHERE id = ?", commentID).Scan(&ownerID)
	if err != nil {
		return err
	}

	if ownerID != userID {
		return errors.New("unauthorized")
	}

	_, err = r.db.Exec("DELETE FROM comments WHERE id = ?", commentID)
	return err
}

func (r *CommentRepository) GetCommentByID(commentID int) (*models.Comment, error) {
	var c models.Comment
	var createdAtStr string
	err := r.db.QueryRow(`
		SELECT id, post_id, user_id, content, img, created_at
		FROM comments
		WHERE id = ?
	`, commentID).Scan(&c.ID, &c.PostID, &c.UserID, &c.Content, &c.Image, &createdAtStr)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	c.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &c, nil
}

func (r *CommentRepository) DeleteCommentByID(commentID int) error {
	_, err := r.db.Exec("DELETE FROM comments WHERE id = ?", commentID)
	return err
}

func (r *CommentRepository) CountByPostID(postID int) (int, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM comments WHERE post_id = ?", postID).Scan(&count)
	return count, err
}
