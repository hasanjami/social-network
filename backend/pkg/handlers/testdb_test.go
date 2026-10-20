package handlers

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	// modernc.org/sqlite is used only in *_test.go files (no CGO). Production uses mattn/go-sqlite3 in pkg/db/sqlite.ConnectAndMigrate.
	_ "modernc.org/sqlite"
)

var testDBSeq int64

// mustNewTestDB opens an in-memory DB and applies migrations. For handler tests only.
func mustNewTestDB(t *testing.T) *sql.DB {
	t.Helper()
	uniq := atomic.AddInt64(&testDBSeq, 1)
	dsn := fmt.Sprintf("file:mem%d?mode=memory&cache=shared", uniq)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		t.Fatal(err)
	}

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// This file is backend/pkg/handlers/testdb_test.go -> module root is two levels up.
	backendRoot := filepath.Join(filepath.Dir(file), "..", "..")
	migrationsPath := filepath.ToSlash(filepath.Join(backendRoot, "pkg", "db", "migrations", "sqlite"))

	driver, err := sqlite3.WithInstance(db, &sqlite3.Config{})
	if err != nil {
		t.Fatal(err)
	}
	m, err := migrate.NewWithDatabaseInstance("file://"+migrationsPath, "sqlite3", driver)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		t.Fatal(err)
	}
	return db
}
