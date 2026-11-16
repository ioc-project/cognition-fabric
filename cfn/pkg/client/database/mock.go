// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package database

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/audit"
	"github.com/google/uuid"
)

// MockDatabase is an in-memory Store for tests that don't need a real Postgres.
type MockDatabase struct {
	mu     sync.Mutex
	events map[uuid.UUID]*audit.Audit
}

// NewMockDatabase creates an empty in-memory MockDatabase.
func NewMockDatabase() *MockDatabase {
	return &MockDatabase{events: make(map[uuid.UUID]*audit.Audit)}
}

func (m *MockDatabase) Close() error { return nil }

func (m *MockDatabase) CreateAuditEvent(ctx context.Context, a *audit.Audit) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := audit.ValidateSource(a.Source); err != nil {
		return err
	}
	if err := audit.ValidateResourceType(a.ResourceType); err != nil {
		return err
	}
	if err := audit.ValidateAuditType(a.AuditType); err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	a.ID = uuid.New()
	audit.PopulateCFNOutcome(a)
	now := time.Now().UTC()
	a.CreatedOn = now
	a.LastModifiedOn = now
	m.events[a.ID] = a
	return nil
}

func (m *MockDatabase) GetAuditEventByID(ctx context.Context, id uuid.UUID) (*audit.Audit, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.events[id]
	if !ok {
		return nil, audit.ErrNotFound
	}
	return a, nil
}

func (m *MockDatabase) ListAuditEvents(ctx context.Context, resourceType, auditType string, page, pageSize int, filters ...audit.ListFilters) (*audit.AuditListResponse, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var extra audit.ListFilters
	if len(filters) > 0 {
		extra = filters[0]
	}
	if err := extra.Validate(); err != nil {
		return nil, err
	}
	if resourceType != "" {
		if err := audit.ValidateResourceType(resourceType); err != nil {
			return nil, err
		}
	}
	if auditType != "" {
		if err := audit.ValidateAuditType(auditType); err != nil {
			return nil, err
		}
	}
	if pageSize <= 0 {
		pageSize = audit.DefaultPageSize()
	}
	if pageSize > audit.MaxPageSize() {
		pageSize = audit.MaxPageSize()
	}
	if page < 0 {
		page = 0
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	filtered := make([]audit.Audit, 0, len(m.events))
	for _, a := range m.events {
		if resourceType != "" && a.ResourceType != resourceType {
			continue
		}
		if auditType != "" && a.AuditType != auditType {
			continue
		}
		if !extra.Matches(a) {
			continue
		}
		filtered = append(filtered, *a)
	}
	sort.Slice(filtered, func(i, j int) bool { return filtered[i].CreatedOn.After(filtered[j].CreatedOn) })

	totalElements := len(filtered)
	offset := page * pageSize
	result := []audit.Audit{}
	if offset < totalElements {
		end := offset + pageSize
		if end > totalElements {
			end = totalElements
		}
		result = filtered[offset:end]
	}

	return &audit.AuditListResponse{
		Data: result,
		PageInfo: audit.PageInfo{
			Page:          page,
			PageSize:      pageSize,
			PageCount:     len(result),
			TotalElements: totalElements,
		},
	}, nil
}

var _ Store = (*MockDatabase)(nil)

func (m *MockDatabase) AppendProxyAuditEvent(ctx context.Context, a *audit.Audit) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, stored := range m.events {
		if stored.Source == a.Source && stored.SourceRecordID != nil && a.SourceRecordID != nil && *stored.SourceRecordID == *a.SourceRecordID {
			same, err := audit.EqualProxyInformation(stored.AuditInformation, a.AuditInformation)
			if err != nil {
				return err
			}
			if !same {
				return audit.ErrRecordConflict
			}
			return nil
		}
	}
	a.ID = uuid.New()
	m.events[a.ID] = a
	return nil
}
