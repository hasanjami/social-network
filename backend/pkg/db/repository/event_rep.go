package repository

import (
	"database/sql"
	"errors"
	"time"

	"backend/pkg/models"
)

type EventRepository struct {
	db *sql.DB
}

func NewEventRepository(db *sql.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) CreateEvent(groupID, creatorID int, title string, description *string, eventDate time.Time) (*models.Event, error) {
	createdAt := time.Now()
	result, err := r.db.Exec(`
		INSERT INTO events (group_id, creator_id, title, description, event_date, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, groupID, creatorID, title, description, eventDate, createdAt)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &models.Event{
		ID:          int(id),
		GroupID:     groupID,
		CreatorID:   creatorID,
		Title:       title,
		Description: description,
		EventDate:   eventDate,
		CreatedAt:   createdAt,
	}, nil
}

func (r *EventRepository) GetEventByID(id int) (*models.Event, error) {
	var event models.Event
	var description sql.NullString
	var eventDateStr, createdAtStr string

	err := r.db.QueryRow(`
		SELECT id, group_id, creator_id, title, description, event_date, created_at
		FROM events WHERE id = ?
	`, id).Scan(
		&event.ID,
		&event.GroupID,
		&event.CreatorID,
		&event.Title,
		&description,
		&eventDateStr,
		&createdAtStr,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	if description.Valid {
		event.Description = &description.String
	}

	event.EventDate, _ = time.Parse(time.RFC3339, eventDateStr)
	event.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)

	return &event, nil
}

func (r *EventRepository) GetEventsByGroupID(groupID int) ([]*models.Event, error) {
	rows, err := r.db.Query(`
		SELECT id, group_id, creator_id, title, description, event_date, created_at
		FROM events
		WHERE group_id = ?
		ORDER BY event_date ASC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		var e models.Event
		var description sql.NullString
		var eventDateStr, createdAtStr string

		err := rows.Scan(&e.ID, &e.GroupID, &e.CreatorID, &e.Title, &description, &eventDateStr, &createdAtStr)
		if err != nil {
			return nil, err
		}

		if description.Valid {
			e.Description = &description.String
		}

		e.EventDate, _ = time.Parse(time.RFC3339, eventDateStr)
		e.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)

		events = append(events, &e)
	}

	return events, nil
}

func (r *EventRepository) RespondToEvent(eventID, userID int, response string) error {
	_, err := r.db.Exec(`
		INSERT OR REPLACE INTO event_responses (event_id, user_id, response, created_at)
		VALUES (?, ?, ?, ?)
	`, eventID, userID, response, time.Now())
	return err
}

func (r *EventRepository) CountResponses(eventID int) (int, int, error) {
	var going, notGoing int
	err := r.db.QueryRow(`
		SELECT
			COUNT(CASE WHEN response = 'going' THEN 1 END),
			COUNT(CASE WHEN response = 'not_going' THEN 1 END)
		FROM event_responses WHERE event_id = ?
	`, eventID).Scan(&going, &notGoing)
	if err != nil {
		return 0, 0, err
	}
	return going, notGoing, nil
}

func (r *EventRepository) GetUserResponse(eventID, userID int) (string, error) {
	var response string
	err := r.db.QueryRow(`
		SELECT response FROM event_responses
		WHERE event_id = ? AND user_id = ?
	`, eventID, userID).Scan(&response)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return response, nil
}

func (r *EventRepository) DeleteEvent(eventID, creatorID int) error {
	var ownerID int
	err := r.db.QueryRow("SELECT creator_id FROM events WHERE id = ?", eventID).Scan(&ownerID)
	if err != nil {
		return err
	}

	if ownerID != creatorID {
		return errors.New("unauthorized")
	}

	_, err = r.db.Exec("DELETE FROM events WHERE id = ?", eventID)
	return err
}
