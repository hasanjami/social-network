package repository

import (
	"database/sql"
	"errors"
	"time"

	"backend/pkg/models"
)

type PostRepository struct {
	db *sql.DB
}

func NewPostRepository(db *sql.DB) *PostRepository {
	return &PostRepository{db: db}
}

func (r *PostRepository) CreatePost(userID int, title, content string, image *string, privacy string, groupID *int) (*models.Post, error) {
	query := `
		INSERT INTO posts (user_id, title, content, image, privacy, group_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`

	createdAt := time.Now()
	result, err := r.db.Exec(query, userID, title, content, image, privacy, groupID, createdAt)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.Post{
		ID:        int(id),
		UserID:    userID,
		Title:     title,
		Content:   content,
		Image:     image,
		Privacy:   privacy,
		GroupID:   groupID,
		CreatedAt: createdAt,
	}, nil
}

func (r *PostRepository) GetPostByID(postID int) (*models.Post, error) {
	query := `
		SELECT id, user_id, title, content, image, privacy, group_id, created_at
		FROM posts
		WHERE id = ?
	`

	var post models.Post
	var createdAtStr string

	err := r.db.QueryRow(query, postID).Scan(
		&post.ID, &post.UserID, &post.Title, &post.Content,
		&post.Image, &post.Privacy, &post.GroupID, &createdAtStr,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	post.CreatedAt, err = time.Parse(time.RFC3339, createdAtStr)
	if err != nil {
		post.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
	}

	return &post, nil
}

func (r *PostRepository) GetPostsByUserID(userID int) ([]*models.Post, error) {
	query := `
		SELECT id, user_id, title, content, image, privacy, group_id, created_at
		FROM posts
		WHERE user_id = ?
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		var post models.Post
		var createdAtStr string

		err := rows.Scan(
			&post.ID, &post.UserID, &post.Title, &post.Content,
			&post.Image, &post.Privacy, &post.GroupID, &createdAtStr,
		)
		if err != nil {
			return nil, err
		}

		post.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		posts = append(posts, &post)
	}

	return posts, nil
}

func (r *PostRepository) GetFeedPosts(userID int) ([]*models.Post, error) {
	query := `
		SELECT DISTINCT p.id, p.user_id, p.title, p.content, p.image, p.privacy, p.group_id, p.created_at
		FROM posts p
		LEFT JOIN followers f ON p.user_id = f.followed_id AND f.follower_id = ? AND f.status = 'accepted'
		WHERE p.group_id IS NULL
		  AND (
			p.privacy = 'public'
			OR (p.privacy = 'almost_private' AND f.follower_id IS NOT NULL)
			OR p.user_id = ?
		  )
		ORDER BY p.created_at DESC
	`

	rows, err := r.db.Query(query, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		var post models.Post
		var createdAtStr string

		err := rows.Scan(
			&post.ID, &post.UserID, &post.Title, &post.Content,
			&post.Image, &post.Privacy, &post.GroupID, &createdAtStr,
		)
		if err != nil {
			return nil, err
		}

		post.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		posts = append(posts, &post)
	}

	return posts, nil
}

func (r *PostRepository) UpdatePost(postID, userID int, title, content string, image *string, privacy string) (*models.Post, error) {
	var postUserID int
	err := r.db.QueryRow("SELECT user_id FROM posts WHERE id = ?", postID).Scan(&postUserID)
	if err != nil {
		return nil, err
	}

	if postUserID != userID {
		return nil, errors.New("unauthorized")
	}

	query := "UPDATE posts SET "
	params := []interface{}{}

	if title != "" {
		query += "title = ?, "
		params = append(params, title)
	}

	if content != "" {
		query += "content = ?, "
		params = append(params, content)
	}

	if image != nil {
		query += "image = ?, "
		params = append(params, *image)
	}

	if privacy != "" {
		query += "privacy = ?, "
		params = append(params, privacy)
	}

	query = query[:len(query)-2]
	query += " WHERE id = ?"
	params = append(params, postID)

	_, err = r.db.Exec(query, params...)
	if err != nil {
		return nil, err
	}

	return r.GetPostByID(postID)
}

func (r *PostRepository) DeletePost(postID, userID int) error {
	var postUserID int
	err := r.db.QueryRow("SELECT user_id FROM posts WHERE id = ?", postID).Scan(&postUserID)
	if err != nil {
		return err
	}

	if postUserID != userID {
		return errors.New("unauthorized")
	}

	_, err = r.db.Exec("DELETE FROM posts WHERE id = ?", postID)
	return err
}

func (r *PostRepository) CountByUserID(userID int) (int, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM posts WHERE user_id = ?", userID).Scan(&count)
	return count, err
}

func (r *PostRepository) GetGroupPosts(groupID int) ([]*models.Post, error) {
	rows, err := r.db.Query(`
		SELECT id, user_id, title, content, image, privacy, group_id, created_at
		FROM posts
		WHERE group_id = ?
		ORDER BY created_at DESC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		var post models.Post
		var createdAtStr string
		err := rows.Scan(
			&post.ID, &post.UserID, &post.Title, &post.Content,
			&post.Image, &post.Privacy, &post.GroupID, &createdAtStr,
		)
		if err != nil {
			return nil, err
		}
		post.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		posts = append(posts, &post)
	}
	return posts, nil
}

// --- Like methods ---

func (r *PostRepository) LikePost(postID, userID int) error {
	_, err := r.db.Exec(
		`INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)`,
		postID, userID,
	)
	return err
}

func (r *PostRepository) UnlikePost(postID, userID int) error {
	_, err := r.db.Exec(
		`DELETE FROM post_likes WHERE post_id = ? AND user_id = ?`,
		postID, userID,
	)
	return err
}

func (r *PostRepository) GetLikeCount(postID int) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM post_likes WHERE post_id = ?`, postID,
	).Scan(&count)
	return count, err
}

func (r *PostRepository) IsLikedByUser(postID, userID int) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM post_likes WHERE post_id = ? AND user_id = ?`,
		postID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *PostRepository) GetLikeCounts(postIDs []int) (map[int]int, error) {
	counts := make(map[int]int)
	if len(postIDs) == 0 {
		return counts, nil
	}
	args := make([]interface{}, len(postIDs))
	query := "SELECT post_id, COUNT(*) FROM post_likes WHERE post_id IN ("
	for i, id := range postIDs {
		args[i] = id
		if i > 0 {
			query += ","
		}
		query += "?"
	}
	query += ") GROUP BY post_id"
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return counts, err
	}
	defer rows.Close()
	for rows.Next() {
		var postID, count int
		if err := rows.Scan(&postID, &count); err != nil {
			return counts, err
		}
		counts[postID] = count
	}
	return counts, nil
}

func (r *PostRepository) GetLikedPostIDs(userID int, postIDs []int) (map[int]bool, error) {
	liked := make(map[int]bool)
	if len(postIDs) == 0 {
		return liked, nil
	}
	args := make([]interface{}, len(postIDs)+1)
	args[0] = userID
	query := "SELECT post_id FROM post_likes WHERE user_id = ? AND post_id IN ("
	for i, id := range postIDs {
		args[i+1] = id
		if i > 0 {
			query += ","
		}
		query += "?"
	}
	query += ")"
	rows, err := r.db.Query(query, args...)
	if err != nil {
		return liked, err
	}
	defer rows.Close()
	for rows.Next() {
		var postID int
		if err := rows.Scan(&postID); err != nil {
			return liked, err
		}
		liked[postID] = true
	}
	return liked, nil
}

// --- Allowed viewers methods (for "private" privacy) ---

func (r *PostRepository) AddAllowedViewers(postID int, userIDs []int) error {
	for _, uid := range userIDs {
		_, err := r.db.Exec(
			`INSERT OR IGNORE INTO post_allowed_viewers (post_id, user_id) VALUES (?, ?)`,
			postID, uid,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *PostRepository) RemoveAllowedViewers(postID int) error {
	_, err := r.db.Exec(`DELETE FROM post_allowed_viewers WHERE post_id = ?`, postID)
	return err
}

func (r *PostRepository) IsAllowedViewer(postID, userID int) (bool, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*) FROM post_allowed_viewers WHERE post_id = ? AND user_id = ?`,
		postID, userID,
	).Scan(&count)
	return count > 0, err
}

func (r *PostRepository) GetAllowedViewers(postID int) ([]int, error) {
	query := `SELECT user_id FROM post_allowed_viewers WHERE post_id = ?`
	rows, err := r.db.Query(query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var userIDs []int
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		userIDs = append(userIDs, userID)
	}
	return userIDs, nil
}
