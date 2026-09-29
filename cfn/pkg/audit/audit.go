// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package audit provides the CFN-side audit trail: recording resource
// lifecycle events and CE invocations, and reading them back for
// mgmt-svc's audit passthrough.
package audit

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ErrNotFound is returned by GetAuditEventByID when no event matches the given
// ID, distinguishing "not found" from a real backend failure (connectivity,
// timeout) so callers can respond with 404 vs 500 correctly.
var ErrNotFound = errors.New("audit event not found")

// ValidationError indicates a caller-supplied resource_type or audit_type
// filter/value was invalid, as opposed to a backend failure - callers can
// distinguish the two with errors.As instead of matching on error text.
type ValidationError struct {
	msg string
}

func (e *ValidationError) Error() string { return e.msg }

// ResourceType enum values
const (
	ResourceTypeCognitionEngine = "COGNITION_ENGINE"
)

// AuditType enum values
const (
	// AuditTypeCEInvoked records CFN calling into a CE (e.g. the CASA Evaluate RPC).
	AuditTypeCEInvoked = "CE_INVOKED"
)

var validResourceTypes = map[string]bool{
	ResourceTypeCognitionEngine: true,
}

var validAuditTypes = map[string]bool{
	AuditTypeCEInvoked: true,
}

// IsValidResourceType returns true if the given resource type is a known valid value.
func IsValidResourceType(rt string) bool {
	return validResourceTypes[rt]
}

// IsValidAuditType returns true if the given audit type is a known valid value.
func IsValidAuditType(at string) bool {
	return validAuditTypes[at]
}

// ValidResourceTypesList returns a comma-separated string of all valid resource types.
func ValidResourceTypesList() string {
	keys := make([]string, 0, len(validResourceTypes))
	for k := range validResourceTypes {
		keys = append(keys, k)
	}
	return strings.Join(keys, ", ")
}

// ValidAuditTypesList returns a comma-separated string of all valid audit types.
func ValidAuditTypesList() string {
	keys := make([]string, 0, len(validAuditTypes))
	for k := range validAuditTypes {
		keys = append(keys, k)
	}
	return strings.Join(keys, ", ")
}

// ValidateResourceType returns a *ValidationError if the given resource type is not valid.
func ValidateResourceType(rt string) error {
	if !IsValidResourceType(rt) {
		return &ValidationError{msg: fmt.Sprintf("invalid resource_type: %s. Valid values: %s", rt, ValidResourceTypesList())}
	}
	return nil
}

// ValidateAuditType returns a *ValidationError if the given audit type is not valid.
func ValidateAuditType(at string) error {
	if !IsValidAuditType(at) {
		return &ValidationError{msg: fmt.Sprintf("invalid audit_type: %s. Valid values: %s", at, ValidAuditTypesList())}
	}
	return nil
}

// Pagination fallback defaults (used when not configured via env/flags).
const (
	FallbackDefaultPageSize = 20
	FallbackMaxPageSize     = 100
)

var (
	paginationMu    sync.RWMutex
	defaultPageSize = FallbackDefaultPageSize
	maxPageSize     = FallbackMaxPageSize
)

// SetPaginationConfig overrides the default and max page sizes.
// Values <= 0 are ignored (the fallback is kept).
func SetPaginationConfig(defSize, maxSize int) {
	paginationMu.Lock()
	defer paginationMu.Unlock()
	if defSize > 0 {
		defaultPageSize = defSize
	}
	if maxSize > 0 {
		maxPageSize = maxSize
	}
	if defaultPageSize > maxPageSize {
		defaultPageSize = maxPageSize
	}
}

// DefaultPageSize returns the configured default page size.
func DefaultPageSize() int {
	paginationMu.RLock()
	defer paginationMu.RUnlock()
	return defaultPageSize
}

// MaxPageSize returns the configured maximum page size.
func MaxPageSize() int {
	paginationMu.RLock()
	defer paginationMu.RUnlock()
	return maxPageSize
}

// PageInfo contains database-agnostic pagination metadata.
type PageInfo struct {
	Page          int `json:"page"`
	PageSize      int `json:"pageSize"`
	PageCount     int `json:"pageCount"`
	TotalElements int `json:"totalElements"`
}

// AuditListResponse wraps a page of audit events with pagination metadata.
type AuditListResponse struct {
	Data     []Audit  `json:"data"`
	PageInfo PageInfo `json:"pageInfo"`
}

// Audit represents an immutable audit trail event.
type Audit struct {
	ID                      uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	OperationID             *string        `gorm:"size:128" json:"operation_id,omitempty"`
	ResourceType            string         `gorm:"size:64;not null;index" json:"resource_type"`
	ResourceIdentifier      string         `gorm:"size:128;not null" json:"resource_identifier"`
	AuditType               string         `gorm:"size:64;not null;index" json:"audit_type"`
	AuditResourceIdentifier string         `gorm:"size:128;not null" json:"audit_resource_identifier"`
	AuditInformation        datatypes.JSON `gorm:"type:jsonb" json:"audit_information,omitempty"`
	AuditExtraInformation   *string        `json:"audit_extra_information,omitempty"`
	// Success indicates whether the audited action itself completed
	// successfully, when that concept applies (e.g. true/false for a
	// CE_INVOKED call that reached the CE vs. errored out).
	Success        *bool     `gorm:"index" json:"success,omitempty"`
	CreatedBy      uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`
	CreatedOn      time.Time `gorm:"not null;index" json:"created_on"`
	LastModifiedBy uuid.UUID `gorm:"type:uuid;not null" json:"last_modified_by"`
	LastModifiedOn time.Time `gorm:"not null" json:"last_modified_on"`
}

// MigrateUp runs GORM AutoMigrate for the Audit table.
func MigrateUp(db *gorm.DB) error {
	return db.AutoMigrate(&Audit{})
}

// CreateAuditEvent inserts a new audit event.
func CreateAuditEvent(ctx context.Context, db *gorm.DB, a *Audit) error {
	if err := ValidateResourceType(a.ResourceType); err != nil {
		return err
	}
	if err := ValidateAuditType(a.AuditType); err != nil {
		return err
	}
	a.ID = uuid.New()
	now := time.Now()
	a.CreatedOn = now
	a.LastModifiedOn = now
	return db.WithContext(ctx).Create(a).Error
}

// GetAuditEventByID retrieves a single audit event by its UUID. Returns
// ErrNotFound if no event matches, distinct from a real backend error.
func GetAuditEventByID(ctx context.Context, db *gorm.DB, id uuid.UUID) (*Audit, error) {
	var a Audit
	if err := db.WithContext(ctx).Where("id = ?", id).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

// ListAuditEvents returns a page of audit events with optional resource_type and audit_type filters.
// page is 0-based. pageSize is clamped to [1, MaxPageSize()] and defaults to DefaultPageSize().
func ListAuditEvents(ctx context.Context, db *gorm.DB, resourceType, auditType string, page, pageSize int) (*AuditListResponse, error) {
	if pageSize <= 0 {
		pageSize = DefaultPageSize()
	}
	if pageSize > MaxPageSize() {
		pageSize = MaxPageSize()
	}
	if page < 0 {
		page = 0
	}

	query := db.WithContext(ctx).Model(&Audit{})
	if resourceType != "" {
		if err := ValidateResourceType(resourceType); err != nil {
			return nil, err
		}
		query = query.Where("resource_type = ?", resourceType)
	}
	if auditType != "" {
		if err := ValidateAuditType(auditType); err != nil {
			return nil, err
		}
		query = query.Where("audit_type = ?", auditType)
	}

	var totalElements int64
	if err := query.Session(&gorm.Session{}).Count(&totalElements).Error; err != nil {
		return nil, err
	}

	audits := make([]Audit, 0)
	offset := page * pageSize
	if err := query.Session(&gorm.Session{}).Offset(offset).Limit(pageSize).Order("created_on DESC").Find(&audits).Error; err != nil {
		return nil, err
	}

	return &AuditListResponse{
		Data: audits,
		PageInfo: PageInfo{
			Page:          page,
			PageSize:      pageSize,
			PageCount:     len(audits),
			TotalElements: int(totalElements),
		},
	}, nil
}
