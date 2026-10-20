package repository

import (
	"database/sql"
	"time"

	"backend/pkg/models"
)

type FollowerRepository struct {
	db *sql.DB
}

func NewFollowerRepository(db *sql.DB) *FollowerRepository {
	return &FollowerRepository{db: db}
}

func (r *FollowerRepository) Follow(followerID, followedID int, status string) error {
	_, err := r.db.Exec(`
		INSERT INTO followers (follower_id, followed_id, status, created_at)
		VALUES (?, ?, ?, ?)
	`, followerID, followedID, status, time.Now())
	return err
}

func (r *FollowerRepository) Unfollow(followerID, followedID int) error {
	_, err := r.db.Exec(`
		DELETE FROM followers WHERE follower_id = ? AND followed_id = ?
	`, followerID, followedID)
	return err
}

func (r *FollowerRepository) AcceptFollow(followerID, followedID int) error {
	_, err := r.db.Exec(`
		UPDATE followers SET status = 'accepted'
		WHERE follower_id = ? AND followed_id = ? AND status = 'pending'
	`, followerID, followedID)
	return err
}

func (r *FollowerRepository) DeclineFollow(followerID, followedID int) error {
	_, err := r.db.Exec(`
		DELETE FROM followers
		WHERE follower_id = ? AND followed_id = ? AND status = 'pending'
	`, followerID, followedID)
	return err
}

func (r *FollowerRepository) IsFollowing(followerID, followedID int) (bool, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM followers
		WHERE follower_id = ? AND followed_id = ? AND status = 'accepted'
	`, followerID, followedID).Scan(&count)
	return count > 0, err
}

func (r *FollowerRepository) GetFollowStatus(followerID, followedID int) (string, error) {
	var status string
	err := r.db.QueryRow(`
		SELECT status FROM followers
		WHERE follower_id = ? AND followed_id = ?
	`, followerID, followedID).Scan(&status)

	if err == sql.ErrNoRows {
		return "", nil
	}
	return status, err
}

func (r *FollowerRepository) GetFollowers(userID int) ([]*models.User, error) {
	rows, err := r.db.Query(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.date_of_birth, u.nickname, u.avatar, u.about_me, u.is_public, u.created_at
		FROM users u
		JOIN followers f ON u.id = f.follower_id
		WHERE f.followed_id = ? AND f.status = 'accepted'
		ORDER BY f.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var user models.User
		var nickname, avatar, aboutMe sql.NullString
		var dobStr string

		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.FirstName, &user.LastName,
			&dobStr, &nickname, &avatar, &aboutMe, &user.IsPublic, &user.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		user.DateOfBirth, _ = time.Parse("2006-01-02", dobStr)
		if nickname.Valid {
			user.Nickname = &nickname.String
		}
		if avatar.Valid {
			user.Avatar = &avatar.String
		}
		if aboutMe.Valid {
			user.AboutMe = &aboutMe.String
		}

		users = append(users, &user)
	}
	return users, nil
}

func (r *FollowerRepository) GetFollowing(userID int) ([]*models.User, error) {
	rows, err := r.db.Query(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.date_of_birth, u.nickname, u.avatar, u.about_me, u.is_public, u.created_at
		FROM users u
		JOIN followers f ON u.id = f.followed_id
		WHERE f.follower_id = ? AND f.status = 'accepted'
		ORDER BY f.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var user models.User
		var nickname, avatar, aboutMe sql.NullString
		var dobStr string

		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.FirstName, &user.LastName,
			&dobStr, &nickname, &avatar, &aboutMe, &user.IsPublic, &user.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		user.DateOfBirth, _ = time.Parse("2006-01-02", dobStr)
		if nickname.Valid {
			user.Nickname = &nickname.String
		}
		if avatar.Valid {
			user.Avatar = &avatar.String
		}
		if aboutMe.Valid {
			user.AboutMe = &aboutMe.String
		}

		users = append(users, &user)
	}
	return users, nil
}

func (r *FollowerRepository) GetPendingRequests(userID int) ([]*models.User, error) {
	rows, err := r.db.Query(`
		SELECT u.id, u.username, u.email, u.first_name, u.last_name,
		       u.date_of_birth, u.nickname, u.avatar, u.about_me, u.is_public, u.created_at
		FROM users u
		JOIN followers f ON u.id = f.follower_id
		WHERE f.followed_id = ? AND f.status = 'pending'
		ORDER BY f.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		var user models.User
		var nickname, avatar, aboutMe sql.NullString
		var dobStr string

		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.FirstName, &user.LastName,
			&dobStr, &nickname, &avatar, &aboutMe, &user.IsPublic, &user.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		user.DateOfBirth, _ = time.Parse("2006-01-02", dobStr)
		if nickname.Valid {
			user.Nickname = &nickname.String
		}
		if avatar.Valid {
			user.Avatar = &avatar.String
		}
		if aboutMe.Valid {
			user.AboutMe = &aboutMe.String
		}

		users = append(users, &user)
	}
	return users, nil
}

func (r *FollowerRepository) CountFollowers(userID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM followers
		WHERE followed_id = ? AND status = 'accepted'
	`, userID).Scan(&count)
	return count, err
}

func (r *FollowerRepository) CountFollowing(userID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM followers
		WHERE follower_id = ? AND status = 'accepted'
	`, userID).Scan(&count)
	return count, err
}
