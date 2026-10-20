// Package sqlite opens the production database with github.com/mattn/go-sqlite3 (CGO) and applies migrations.
// Integration tests that need SQLite without CGO import modernc.org/sqlite from *_test.go files in the handlers package only.
package sqlite

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/mattn/go-sqlite3"
)

func ConnectAndMigrate() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "social.db")
	if err != nil {
		return nil, fmt.Errorf("error opening database: %v", err)
	}

	log.Println("Database connected successfully.")

	_, err = db.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return nil, fmt.Errorf("could not enable foreign key support: %v", err)
	}

	if err := applyMigrations(db); err != nil {
		return nil, err
	}

	return db, nil
}

func applyMigrations(db *sql.DB) error {
	driver, err := sqlite3.WithInstance(db, &sqlite3.Config{})
	if err != nil {
		return fmt.Errorf("could not create driver: %v", err)
	}

	migrationsPath, err := filepath.Abs("pkg/db/migrations/sqlite")
	if err != nil {
		return fmt.Errorf("error resolving migrations path: %v", err)
	}

	migrationsPath = filepath.ToSlash(migrationsPath)

	sourceURL := "file://" + migrationsPath

	log.Println("Using migrations from:", sourceURL)

	m, err := migrate.NewWithDatabaseInstance(sourceURL, "sqlite3", driver)
	if err != nil {
		return fmt.Errorf("could not load migrations: %v", err)
	}

	err = m.Up()
	if err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migration error: %v", err)
	}

	log.Println("Migrations applied successfully.")
	return nil
}

