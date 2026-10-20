package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"backend/pkg/db/repository"
	"backend/pkg/models"
	"backend/pkg/ws"
)

func mustCreateUser(t *testing.T, ur *repository.UserRepository, username string) int {
	t.Helper()
	u := &models.User{
		Username:    username,
		Email:       username + "@t.example",
		Password:    "x",
		FirstName:   "T",
		LastName:    "U",
		DateOfBirth: time.Date(1990, 1, 1, 0, 0, 0, 0, time.UTC),
		IsPublic:    true,
		CreatedAt:   time.Now(),
	}
	id, err := ur.Create(u)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func mustCreateGroup(t *testing.T, gr *repository.GroupRepository, creatorID int, privacy string) int {
	t.Helper()
	now := time.Now()
	g := &models.Group{
		Name:      "Test Group",
		CreatorID: creatorID,
		Privacy:   privacy,
		CreatedAt: now,
	}
	id, err := gr.Create(g)
	if err != nil {
		t.Fatal(err)
	}
	err = gr.AddMember(&models.GroupMember{
		GroupID:     id,
		UserID:      creatorID,
		InviterID:   creatorID,
		Status:      "accepted",
		RequestType: "join_request",
		CreatedAt:   now,
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func countNotifications(t *testing.T, db *sql.DB, recipientID int, ntype string) int {
	t.Helper()
	var n int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM notifications
		WHERE recipient_id = ? AND type = ?
	`, recipientID, ntype).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestInviteToGroup_SelfInvite_BadRequest(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	creator := mustCreateUser(t, ur, "creator")
	gid := mustCreateGroup(t, gr, creator, "public")

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/invite", strings.NewReader(`{"userId":`+strconv.Itoa(creator)+`}`))
	req = req.WithContext(context.WithValue(req.Context(), "userID", creator))
	rr := httptest.NewRecorder()
	h.InviteToGroupHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestJoinGroup_PrivateGroup_Forbidden(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	creator := mustCreateUser(t, ur, "c1")
	joiner := mustCreateUser(t, ur, "j1")
	gid := mustCreateGroup(t, gr, creator, "private")

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/join", nil)
	req = req.WithContext(context.WithValue(req.Context(), "userID", joiner))
	rr := httptest.NewRecorder()
	h.JoinGroupHandler(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestJoinGroup_CreatorCannotJoin_BadRequest(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	creator := mustCreateUser(t, ur, "cr")
	gid := mustCreateGroup(t, gr, creator, "public")

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/join", nil)
	req = req.WithContext(context.WithValue(req.Context(), "userID", creator))
	rr := httptest.NewRecorder()
	h.JoinGroupHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestAcceptInvite_Invitation_NotifiesInviter(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	inviter := mustCreateUser(t, ur, "inviter")
	invitee := mustCreateUser(t, ur, "invitee")
	gid := mustCreateGroup(t, gr, inviter, "public")

	err := gr.AddMember(&models.GroupMember{
		GroupID:     gid,
		UserID:      invitee,
		InviterID:   inviter,
		Status:      "pending",
		RequestType: "invitation",
		CreatedAt:   time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/accept", strings.NewReader("{}"))
	req = req.WithContext(context.WithValue(req.Context(), "userID", invitee))
	rr := httptest.NewRecorder()
	h.AcceptInviteHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	if n := countNotifications(t, db, inviter, "group_invitation_accepted"); n != 1 {
		t.Fatalf("expected 1 invitation accepted notification for inviter, got %d", n)
	}
}

func TestDeclineInvite_Invitation_NotifiesInviter(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	inviter := mustCreateUser(t, ur, "inv2")
	invitee := mustCreateUser(t, ur, "inv2e")
	gid := mustCreateGroup(t, gr, inviter, "public")

	err := gr.AddMember(&models.GroupMember{
		GroupID:     gid,
		UserID:      invitee,
		InviterID:   inviter,
		Status:      "pending",
		RequestType: "invitation",
		CreatedAt:   time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/decline", strings.NewReader("{}"))
	req = req.WithContext(context.WithValue(req.Context(), "userID", invitee))
	rr := httptest.NewRecorder()
	h.DeclineInviteHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	if n := countNotifications(t, db, inviter, "group_invitation_declined"); n != 1 {
		t.Fatalf("expected 1 invitation declined notification, got %d", n)
	}
}

func TestAcceptInvite_JoinRequest_NotifiesRequester(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	creator := mustCreateUser(t, ur, "crj")
	requester := mustCreateUser(t, ur, "reqj")
	gid := mustCreateGroup(t, gr, creator, "public")

	err := gr.AddMember(&models.GroupMember{
		GroupID:     gid,
		UserID:      requester,
		InviterID:   requester,
		Status:      "pending",
		RequestType: "join_request",
		CreatedAt:   time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}

	body := `{"userId":` + strconv.Itoa(requester) + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/accept", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), "userID", creator))
	rr := httptest.NewRecorder()
	h.AcceptInviteHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	if n := countNotifications(t, db, requester, "group_join_accepted"); n != 1 {
		t.Fatalf("expected 1 join accepted notification, got %d", n)
	}
}

func TestAcceptInvite_Invitation_WrongActor_Forbidden(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	inviter := mustCreateUser(t, ur, "inv3")
	invitee := mustCreateUser(t, ur, "inv3e")
	other := mustCreateUser(t, ur, "other")
	gid := mustCreateGroup(t, gr, inviter, "public")

	err := gr.AddMember(&models.GroupMember{
		GroupID:     gid,
		UserID:      invitee,
		InviterID:   inviter,
		Status:      "pending",
		RequestType: "invitation",
		CreatedAt:   time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/accept", strings.NewReader(`{"userId":`+strconv.Itoa(invitee)+`}`))
	req = req.WithContext(context.WithValue(req.Context(), "userID", other))
	rr := httptest.NewRecorder()
	h.AcceptInviteHandler(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestAcceptInvite_InvalidJSON_BadRequest(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	u := mustCreateUser(t, ur, "u")
	gid := mustCreateGroup(t, gr, u, "public")

	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/accept", strings.NewReader(`{`))
	req = req.WithContext(context.WithValue(req.Context(), "userID", u))
	rr := httptest.NewRecorder()
	h.AcceptInviteHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestAcceptInvite_ResponseJSON(t *testing.T) {
	db := mustNewTestDB(t)
	defer db.Close()

	ur := repository.NewUserRepository(db)
	gr := repository.NewGroupRepository(db)
	nr := repository.NewNotificationRepository(db)
	h := NewGroupHandler(gr, ur, nr, ws.NewHub())

	creator := mustCreateUser(t, ur, "resp")
	requester := mustCreateUser(t, ur, "respr")
	gid := mustCreateGroup(t, gr, creator, "public")

	err := gr.AddMember(&models.GroupMember{
		GroupID:     gid,
		UserID:      requester,
		InviterID:   requester,
		Status:      "pending",
		RequestType: "join_request",
		CreatedAt:   time.Now(),
	})
	if err != nil {
		t.Fatal(err)
	}

	body := `{"userId":` + strconv.Itoa(requester) + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/groups/"+strconv.Itoa(gid)+"/accept", strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), "userID", creator))
	rr := httptest.NewRecorder()
	h.AcceptInviteHandler(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	var out map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if out["requestType"] != "join_request" {
		t.Fatalf("expected join_request in response, got %v", out)
	}
}
