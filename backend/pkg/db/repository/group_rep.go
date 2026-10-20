// backend/pkg/db/repository/group_rep.go
package repository

import (
	"database/sql"

	"backend/pkg/models"
)

type GroupRepository struct {
	db *sql.DB
}

func NewGroupRepository(db *sql.DB) *GroupRepository {
	return &GroupRepository{db: db}
}

// Create creates a new group
func (r *GroupRepository) Create(group *models.Group) (int, error) {
	if group.Privacy == "" {
		group.Privacy = "public"
	}
	result, err := r.db.Exec(`
		INSERT INTO groups (name, description, creator_id, img, created_at, privacy)
		VALUES (?, ?, ?, ?, ?, ?)
	`,
		group.Name,
		group.Description,
		group.CreatorID,
		group.Image,
		group.CreatedAt,
		group.Privacy,
	)

	if err != nil {
		return 0, err
	}

	id, err := result.LastInsertId()
	return int(id), err
}

// FindByID finds a group by ID
func (r *GroupRepository) FindByID(id int) (*models.Group, error) {
	var group models.Group
	var description, image sql.NullString

	err := r.db.QueryRow(`
		SELECT id, name, description, creator_id, img, created_at, privacy
		FROM groups WHERE id = ?
	`, id).Scan(
		&group.ID,
		&group.Name,
		&description,
		&group.CreatorID,
		&image,
		&group.CreatedAt,
		&group.Privacy,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	// Handle nullable fields
	if description.Valid {
		group.Description = &description.String
	}
	if image.Valid {
		group.Image = &image.String
	}

	return &group, nil
}

// FindByCreatorID finds all groups created by a user
func (r *GroupRepository) FindByCreatorID(creatorID int) ([]*models.Group, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, creator_id, img, created_at, privacy
		FROM groups WHERE creator_id = ?
		ORDER BY created_at DESC
	`, creatorID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group
		var description, image sql.NullString

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&description,
			&group.CreatorID,
			&image,
			&group.CreatedAt,
			&group.Privacy,
		)

		if err != nil {
			return nil, err
		}

		// Handle nullable fields
		if description.Valid {
			group.Description = &description.String
		}
		if image.Valid {
			group.Image = &image.String
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// Update updates group information
func (r *GroupRepository) Update(group *models.Group) error {
	if group.Privacy == "" {
		group.Privacy = "public"
	}
	_, err := r.db.Exec(`
		UPDATE groups SET
			name = ?,
			description = ?,
			img = ?,
			privacy = ?
		WHERE id = ?
	`,
		group.Name,
		group.Description,
		group.Image,
		group.Privacy,
		group.ID,
	)
	return err
}

// Delete deletes a group by ID
func (r *GroupRepository) Delete(id int) error {
	_, err := r.db.Exec(`DELETE FROM groups WHERE id = ?`, id)
	return err
}

// GetAll returns all groups
func (r *GroupRepository) GetAll(limit, offset int) ([]*models.Group, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, creator_id, img, created_at, privacy
		FROM groups
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, limit, offset)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group
		var description, image sql.NullString

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&description,
			&group.CreatorID,
			&image,
			&group.CreatedAt,
			&group.Privacy,
		)

		if err != nil {
			return nil, err
		}

		// Handle nullable fields
		if description.Valid {
			group.Description = &description.String
		}
		if image.Valid {
			group.Image = &image.String
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// SearchByName searches groups by name
func (r *GroupRepository) SearchByName(query string, limit int) ([]*models.Group, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, creator_id, img, created_at, privacy
		FROM groups
		WHERE name LIKE ?
		ORDER BY name
		LIMIT ?
	`, "%"+query+"%", limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group
		var description, image sql.NullString

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&description,
			&group.CreatorID,
			&image,
			&group.CreatedAt,
			&group.Privacy,
		)

		if err != nil {
			return nil, err
		}

		// Handle nullable fields
		if description.Valid {
			group.Description = &description.String
		}
		if image.Valid {
			group.Image = &image.String
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// CountMembers counts the number of accepted members in a group
func (r *GroupRepository) CountMembers(groupID int) (int, error) {
	var count int
	err := r.db.QueryRow(`
		SELECT COUNT(*) FROM group_members
		WHERE group_id = ? AND status = 'accepted'
	`, groupID).Scan(&count)
	return count, err
}

// IsMember checks if a user is a member of a group
func (r *GroupRepository) IsMember(groupID, userID int) (bool, string, string, error) {
	var status, requestType string
	err := r.db.QueryRow(`
		SELECT status, request_type FROM group_members
		WHERE group_id = ? AND user_id = ?
	`, groupID, userID).Scan(&status, &requestType)

	if err != nil {
		if err == sql.ErrNoRows {
			return false, "", "", nil
		}
		return false, "", "", err
	}

	return true, status, requestType, nil
}

// AddMember adds a member to a group
func (r *GroupRepository) AddMember(member *models.GroupMember) error {
	_, err := r.db.Exec(`
		INSERT INTO group_members (group_id, user_id, inviter_id, status, request_type, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`,
		member.GroupID,
		member.UserID,
		member.InviterID,
		member.Status,
		member.RequestType,
		member.CreatedAt,
	)
	return err
}

// UpdateMemberStatus updates the status of a group member
func (r *GroupRepository) UpdateMemberStatus(groupID, userID int, status string) error {
	_, err := r.db.Exec(`
		UPDATE group_members SET status = ?
		WHERE group_id = ? AND user_id = ?
	`, status, groupID, userID)
	return err
}

// RemoveMember removes a member from a group
func (r *GroupRepository) RemoveMember(groupID, userID int) error {
	_, err := r.db.Exec(`
		DELETE FROM group_members
		WHERE group_id = ? AND user_id = ?
	`, groupID, userID)
	return err
}

// GetMembers gets all members of a group
func (r *GroupRepository) GetMembers(groupID int, status string) ([]*models.GroupMember, error) {
	var rows *sql.Rows
	var err error

	if status != "" {
		rows, err = r.db.Query(`
			SELECT id, group_id, user_id, inviter_id, status, request_type, created_at
			FROM group_members
			WHERE group_id = ? AND status = ?
			ORDER BY created_at DESC
		`, groupID, status)
	} else {
		rows, err = r.db.Query(`
			SELECT id, group_id, user_id, inviter_id, status, request_type, created_at
			FROM group_members
			WHERE group_id = ?
			ORDER BY created_at DESC
		`, groupID)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*models.GroupMember
	for rows.Next() {
		var member models.GroupMember
		err := rows.Scan(
			&member.ID,
			&member.GroupID,
			&member.UserID,
			&member.InviterID,
			&member.Status,
			&member.RequestType,
			&member.CreatedAt,
		)

		if err != nil {
			return nil, err
		}

		members = append(members, &member)
	}

	return members, nil
}

// GetUserGroups gets all groups a user is a member of
func (r *GroupRepository) GetUserGroups(userID int, status string) ([]*models.Group, error) {
	var rows *sql.Rows
	var err error

	if status != "" {
		rows, err = r.db.Query(`
			SELECT g.id, g.name, g.description, g.creator_id, g.img, g.created_at, g.privacy
			FROM groups g
			INNER JOIN group_members gm ON g.id = gm.group_id
			WHERE gm.user_id = ? AND gm.status = ?
			ORDER BY g.created_at DESC
		`, userID, status)
	} else {
		rows, err = r.db.Query(`
			SELECT g.id, g.name, g.description, g.creator_id, g.img, g.created_at, g.privacy
			FROM groups g
			INNER JOIN group_members gm ON g.id = gm.group_id
			WHERE gm.user_id = ?
			ORDER BY g.created_at DESC
		`, userID)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.Group
	for rows.Next() {
		var group models.Group
		var description, image sql.NullString

		err := rows.Scan(
			&group.ID,
			&group.Name,
			&description,
			&group.CreatorID,
			&image,
			&group.CreatedAt,
			&group.Privacy,
		)

		if err != nil {
			return nil, err
		}

		// Handle nullable fields
		if description.Valid {
			group.Description = &description.String
		}
		if image.Valid {
			group.Image = &image.String
		}

		groups = append(groups, &group)
	}

	return groups, nil
}

// GetMember returns a membership row for a user in a group, or nil if none.
func (r *GroupRepository) GetMember(groupID, userID int) (*models.GroupMember, error) {
	var member models.GroupMember
	err := r.db.QueryRow(`
		SELECT id, group_id, user_id, inviter_id, status, request_type, created_at
		FROM group_members
		WHERE group_id = ? AND user_id = ?
	`, groupID, userID).Scan(
		&member.ID,
		&member.GroupID,
		&member.UserID,
		&member.InviterID,
		&member.Status,
		&member.RequestType,
		&member.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &member, nil
}
