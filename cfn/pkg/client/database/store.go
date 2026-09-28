// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package database

import (
	"context"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/google/uuid"
)

// Store is the audit persistence interface consumed by the app and enforcement
// server, so tests can inject an in-memory MockDatabase instead of a real
// Postgres connection.
type Store interface {
	CreateAuditEvent(ctx context.Context, a *audit.Audit) error
	GetAuditEventByID(ctx context.Context, id uuid.UUID) (*audit.Audit, error)
	ListAuditEvents(ctx context.Context, resourceType, auditType string, page, pageSize int) (*audit.AuditListResponse, error)
	Close() error
}

var _ Store = (*Database)(nil)
