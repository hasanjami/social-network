// backend/pkg/repository/user_repository.go
package repository

import (
	"database/sql"
	"time"

	"backend/pkg/models"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(user *models.User) (int, error) {
	result, err := r.db.Exec(`
		INSERT INTO users (
			username, email, password, first_name, last_name, 
			date_of_birth, nickname, avatar, about_me, is_public, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		user.Username,
		user.Email,
		user.Password,
		user.FirstName,
		user.LastName,
		user.DateOfBirth.Format("2006-01-02"),
		user.Nickname,
		user.Avatar,
		user.AboutMe,
		user.IsPublic,
		user.CreatedAt,
	)
	
	if err != nil {
		return 0, err
	}
	
	id, err := result.LastInsertId()
	return int(id), err
}

func (r *UserRepository) FindByID(id int) (*models.User, error) {
	var user models.User
	var nickname, avatar, aboutMe sql.NullString
	var dateOfBirthStr string
	
	err := r.db.QueryRow(`
		SELECT id, username, email, password, first_name, last_name,
		       date_of_birth, nickname, avatar, about_me, is_public, created_at
		FROM users WHERE id = ?
	`, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.FirstName,
		&user.LastName,
		&dateOfBirthStr,
		&nickname,
		&avatar,
		&aboutMe,
		&user.IsPublic,
		&user.CreatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Parse date
	user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
	
	// Handle nullable fields
	if nickname.Valid {
		user.Nickname = &nickname.String
	}
	if avatar.Valid {
		user.Avatar = &avatar.String
	}
	if aboutMe.Valid {
		user.AboutMe = &aboutMe.String
	}
	
	return &user, nil
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	var user models.User
	var nickname, avatar, aboutMe sql.NullString
	var dateOfBirthStr string
	
	err := r.db.QueryRow(`
		SELECT id, username, email, password, first_name, last_name,
		       date_of_birth, nickname, avatar, about_me, is_public, created_at
		FROM users WHERE email = ?
	`, email).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.FirstName,
		&user.LastName,
		&dateOfBirthStr,
		&nickname,
		&avatar,
		&aboutMe,
		&user.IsPublic,
		&user.CreatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Parse date
	user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
	
	// Handle nullable fields
	if nickname.Valid {
		user.Nickname = &nickname.String
	}
	if avatar.Valid {
		user.Avatar = &avatar.String
	}
	if aboutMe.Valid {
		user.AboutMe = &aboutMe.String
	}
	
	return &user, nil
}

func (r *UserRepository) FindByUsername(username string) (*models.User, error) {
	var user models.User
	var nickname, avatar, aboutMe sql.NullString
	var dateOfBirthStr string
	
	err := r.db.QueryRow(`
		SELECT id, username, email, password, first_name, last_name,
		       date_of_birth, nickname, avatar, about_me, is_public, created_at
		FROM users WHERE username = ?
	`, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.Password,
		&user.FirstName,
		&user.LastName,
		&dateOfBirthStr,
		&nickname,
		&avatar,
		&aboutMe,
		&user.IsPublic,
		&user.CreatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	
	// Parse date
	user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
	
	// Handle nullable fields
	if nickname.Valid {
		user.Nickname = &nickname.String
	}
	if avatar.Valid {
		user.Avatar = &avatar.String
	}
	if aboutMe.Valid {
		user.AboutMe = &aboutMe.String
	}
	
	return &user, nil
}


func (r *UserRepository) Update(user *models.User) error {
	_, err := r.db.Exec(`
		UPDATE users SET
			first_name = ?,
			last_name = ?,
			date_of_birth = ?,
			nickname = ?,
			avatar = ?,
			about_me = ?,
			is_public = ?,
			password = ?
		WHERE id = ?
	`,
		user.FirstName,
		user.LastName,
		user.DateOfBirth.Format("2006-01-02"),
		user.Nickname,
		user.Avatar,
		user.AboutMe,
		user.IsPublic,
		user.Password,
		user.ID,
	)
	return err
}

// GetAllExcluding returns all users except the specified one
func (r *UserRepository) GetAllExcluding(excludeID int) ([]*models.User, error) {
	rows, err := r.db.Query(`
		SELECT id, username, email, first_name, last_name,
		       date_of_birth, nickname, avatar, about_me, is_public, created_at
		FROM users WHERE id != ? ORDER BY created_at DESC
	`, excludeID)
	
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var users []*models.User
	for rows.Next() {
		var user models.User
		var nickname, avatar, aboutMe sql.NullString
		var dateOfBirthStr string
		
		err := rows.Scan(
			&user.ID,
			&user.Username,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&dateOfBirthStr,
			&nickname,
			&avatar,
			&aboutMe,
			&user.IsPublic,
			&user.CreatedAt,
		)
		
		if err != nil {
			return nil, err
		}
		
		// Parse date
		user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
		
		// Handle nullable fields
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

// Count returns total number of users
func (r *UserRepository) Count() (int, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

// SearchByUsername searches users by username
func (r *UserRepository) SearchByUsername(query string, limit int) ([]*models.User, error) {
	rows, err := r.db.Query(`
		SELECT id, username, email, first_name, last_name,
		       date_of_birth, nickname, avatar, about_me, is_public, created_at
		FROM users 
		WHERE username LIKE ? 
		ORDER BY username 
		LIMIT ?
	`, "%"+query+"%", limit)
	
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var users []*models.User
	for rows.Next() {
		var user models.User
		var nickname, avatar, aboutMe sql.NullString
		var dateOfBirthStr string
		
		err := rows.Scan(
			&user.ID,
			&user.Username,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&dateOfBirthStr,
			&nickname,
			&avatar,
			&aboutMe,
			&user.IsPublic,
			&user.CreatedAt,
		)
		
		if err != nil {
			return nil, err
		}
		
		// Parse date
		user.DateOfBirth, _ = time.Parse("2006-01-02", dateOfBirthStr)
		
		// Handle nullable fields
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