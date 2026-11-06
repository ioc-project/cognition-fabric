// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package database wraps a GORM connection to cfn-svc's own PostgreSQL database.
package database

import (
	"context"
	"time"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/config"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Connection pool limits, so a burst of enforcement traffic (each firing an
// audit write) can't open unbounded connections against Postgres.
const (
	maxOpenConns    = 25
	maxIdleConns    = 5
	connMaxIdleTime = 5 * time.Minute
)

// Database wraps a GORM DB connection to PostgreSQL.
type Database struct {
	*gorm.DB
}

// New opens a PostgreSQL connection using the provided config.
func New(cfg config.Database) (*Database, error) {
	gdb, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxIdleTime(connMaxIdleTime)

	return &Database{DB: gdb}, nil
}

// Close closes the underlying database connection.
func (db *Database) Close() error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// MigrateUp runs all auto-migrations.
func (db *Database) MigrateUp() error {
	return audit.MigrateUp(db.DB)
}

// CreateAuditEvent inserts a new audit event.
func (db *Database) CreateAuditEvent(ctx context.Context, a *audit.Audit) error {
	return audit.CreateAuditEvent(ctx, db.DB, a)
}

func (db *Database) AppendProxyAuditEvent(ctx context.Context, a *audit.Audit) error {
	return audit.AppendProxyAuditEvent(ctx, db.DB, a)
}

// GetAuditEventByID retrieves a single audit event by UUID.
func (db *Database) GetAuditEventByID(ctx context.Context, id uuid.UUID) (*audit.Audit, error) {
	return audit.GetAuditEventByID(ctx, db.DB, id)
}

// ListAuditEvents returns audit events with optional filters applied before pagination.
func (db *Database) ListAuditEvents(ctx context.Context, resourceType, auditType string, page, pageSize int, filters ...audit.ListFilters) (*audit.AuditListResponse, error) {
	return audit.ListAuditEvents(ctx, db.DB, resourceType, auditType, page, pageSize, filters...)
}
