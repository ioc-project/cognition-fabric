// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package audit provides the CFN-side audit trail: recording resource
// lifecycle events and CE invocations, and reading them back for
// mgmt-svc's audit passthrough.
package audit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/tools/logger"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ErrNotFound is returned by GetAuditEventByID when no event matches the given
// ID, distinguishing "not found" from a real backend failure (connectivity,
// timeout) so callers can respond with 404 vs 500 correctly.
var ErrNotFound = errors.New("audit event not found")

// ValidationError indicates a caller-supplied audit filter or field
// filter/value was invalid, as opposed to a backend failure - callers can
// distinguish the two with errors.As instead of matching on error text.
type ValidationError struct {
	msg string
}

func (e *ValidationError) Error() string { return e.msg }

// ResourceType enum values
const (
	ResourceTypeCognitionEngine  = "COGNITION_ENGINE"
	ResourceTypeEnforcementProxy = "ENFORCEMENT_PROXY"
)

// AuditType enum values
const (
	// AuditTypeCEInvoked records CFN calling into a CE (e.g. the CASA Evaluate RPC).
	AuditTypeCEInvoked = "CE_INVOKED"
	// AuditTypeCENotInvoked records a disposition failure before Evaluate.
	AuditTypeCENotInvoked  = "CE_NOT_INVOKED"
	SourceCFN              = "CFN"
	SourceProxy            = "PROXY"
	AuditTypeProxyMediated = "PROXY_MEDIATED"
)

var validResourceTypes = map[string]bool{
	ResourceTypeCognitionEngine:  true,
	ResourceTypeEnforcementProxy: true,
}

var validAuditTypes = map[string]bool{
	AuditTypeCEInvoked:     true,
	AuditTypeCENotInvoked:  true,
	AuditTypeProxyMediated: true,
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

// ValidateSource accepts producer identities without limiting future producers.
func ValidateSource(source string) error {
	if strings.TrimSpace(source) == "" {
		return &ValidationError{msg: "audit source must not be empty"}
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
	Source                  string         `gorm:"not null;default:CFN;uniqueIndex:idx_audits_source_record,priority:1" json:"source"`
	SourceRecordID          *string        `gorm:"size:128;uniqueIndex:idx_audits_source_record,priority:2" json:"-"`
	Outcome                 *string        `gorm:"size:64" json:"outcome,omitempty"`
	OperationID             *string        `gorm:"size:128" json:"operation_id,omitempty"`
	ResourceType            string         `gorm:"size:64;not null;index" json:"resource_type"`
	ResourceIdentifier      string         `gorm:"size:128;not null" json:"resource_identifier"`
	AuditType               string         `gorm:"size:64;not null;index" json:"audit_type"`
	AuditResourceIdentifier string         `gorm:"size:128;not null" json:"audit_resource_identifier"`
	AuditInformation        datatypes.JSON `gorm:"type:jsonb" json:"audit_information,omitempty"`
	AuditExtraInformation   *string        `json:"audit_extra_information,omitempty"`
	// Success describes the entire audited operation, not its policy decision
	// or the persistence of this row. A completed DENY/BLOCK is successful.
	Success        *bool     `gorm:"index" json:"success,omitempty"`
	CreatedBy      uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`
	CreatedOn      time.Time `gorm:"not null;index" json:"created_on"`
	LastModifiedBy uuid.UUID `gorm:"type:uuid;not null" json:"last_modified_by"`
	LastModifiedOn time.Time `gorm:"not null" json:"last_modified_on"`
}

// MarshalJSON normalizes CF-owned timestamps regardless of the database driver's
// scan location. Producer-owned evidence in AuditInformation is left unchanged.
func (a Audit) MarshalJSON() ([]byte, error) {
	type wireAudit Audit
	wire := wireAudit(a)
	wire.CreatedOn = a.CreatedOn.UTC()
	wire.LastModifiedOn = a.LastModifiedOn.UTC()
	return json.Marshal(wire)
}

// Keep this key stable across CFN versions so startup migrations cooperate.
const auditMigrationLockKey int64 = 0x43464e5f41554449 // "CFN_AUDI"

// MigrateUp preserves historical rows and a permanent default for older CFN writers.
func MigrateUp(db *gorm.DB) error {
	return migrateUp(db, logger.SubPkg("audit"))
}

func migrateUp(db *gorm.DB, log *zap.SugaredLogger) error {
	const backfill = "cfn_disposition_outcome"
	var updatedRows int64
	err := db.Transaction(func(tx *gorm.DB) error {
		// Acquire before inspecting schema. The same transaction holds the lock
		// through DDL and backfill; PostgreSQL releases it on commit or rollback.
		if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", auditMigrationLockKey).Error; err != nil {
			return fmt.Errorf("acquire audit migration lock: %w", err)
		}
		// Repair a partially migrated nullable column before AutoMigrate adds NOT NULL.
		if tx.Migrator().HasTable(&Audit{}) && tx.Migrator().HasColumn(&Audit{}, "Source") {
			if err := tx.Model(&Audit{}).Where("source IS NULL OR source = ?", "").UpdateColumn("source", SourceCFN).Error; err != nil {
				return err
			}
		}
		if err := tx.AutoMigrate(&Audit{}); err != nil {
			return err
		}
		// Only project existing CFN outcomes; preserve original evidence and IDs.
		result := tx.Exec(`UPDATE audits SET outcome = CASE audit_information->>'outcome'
			WHEN 'DECISION_ALLOW' THEN 'ALLOW'
			WHEN 'DECISION_DENY' THEN 'BLOCK'
			WHEN 'DECISION_MODIFY' THEN 'MODIFY_REQUESTED'
			WHEN 'ERROR' THEN 'ERROR' ELSE 'UNKNOWN' END
			WHERE outcome IS NULL AND source = ? AND resource_type = ?
			AND audit_type IN (?, ?) AND audit_information->>'outcome' IS NOT NULL`,
			SourceCFN, ResourceTypeCognitionEngine, AuditTypeCEInvoked, AuditTypeCENotInvoked)
		if result.Error != nil {
			return fmt.Errorf("backfill CFN disposition audit outcomes: %w", result.Error)
		}
		updatedRows = result.RowsAffected
		// GORM does not reliably tighten an existing nullable column. Enforce
		// both guarantees explicitly, including recovery from a partial upgrade.
		return tx.Exec("ALTER TABLE audits ALTER COLUMN source SET DEFAULT 'CFN', ALTER COLUMN source SET NOT NULL").Error
	})
	if err != nil {
		log.Errorw("audit migration failed", "backfill", backfill, "error", err)
		return err
	}
	// Report committed changes only, including zero rows on repeat startups.
	log.Infow("audit backfill completed", "backfill", backfill, "rows_updated", updatedRows)
	return nil
}

// CreateAuditEvent inserts a new audit event.
func CreateAuditEvent(ctx context.Context, db *gorm.DB, a *Audit) error {
	if err := ValidateSource(a.Source); err != nil {
		return err
	}
	if err := ValidateResourceType(a.ResourceType); err != nil {
		return err
	}
	if err := ValidateAuditType(a.AuditType); err != nil {
		return err
	}
	a.ID = uuid.New()
	PopulateCFNOutcome(a)
	now := time.Now().UTC()
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

// ListAuditEvents filters events before counting and pagination.
// page is 0-based. pageSize is clamped to [1, MaxPageSize()] and defaults to DefaultPageSize().
func ListAuditEvents(ctx context.Context, db *gorm.DB, resourceType, auditType string, page, pageSize int, filters ...ListFilters) (*AuditListResponse, error) {
	var extra ListFilters
	if len(filters) > 0 {
		extra = filters[0]
	}
	if err := extra.Validate(); err != nil {
		return nil, err
	}
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
	if extra.Success != nil {
		query = query.Where("success = ?", *extra.Success)
	}
	if outcome := extra.CanonicalOutcome(); outcome != "" {
		query = query.Where("outcome = ?", outcome)
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
