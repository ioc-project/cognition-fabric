// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/config"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// testDB opens a connection to a real Postgres instance for integration
// tests, using the same POSTGRES_* env vars and DSN construction the app
// itself uses, except for the database name: POSTGRES_TEST_DB is a
// deliberately separate override so a test run never points at a real
// dev/production database by accident. Skips the test if no test database is
// reachable (e.g. running locally without a throwaway Postgres container).
func testDB(t *testing.T) *gorm.DB {
	t.Helper()

	cfg := config.DatabaseFromEnv()
	cfg.Name = getEnvOrDefault("POSTGRES_TEST_DB", "cfn_audit_test")

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		t.Skipf("no test Postgres reachable, skipping integration test: %v", err)
	}
	if err := MigrateUp(db); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}
	t.Cleanup(func() {
		db.Exec("TRUNCATE TABLE audits")
	})

	return db
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func TestCreateAndGetAuditEvent(t *testing.T) {
	db := testDB(t)

	event := &Audit{
		Source:                  SourceCFN,
		ResourceType:            ResourceTypeCognitionEngine,
		ResourceIdentifier:      "ce-casa-1",
		AuditType:               AuditTypeCEInvoked,
		AuditResourceIdentifier: "mas-123",
		CreatedBy:               uuid.New(),
		LastModifiedBy:          uuid.New(),
	}

	if err := CreateAuditEvent(context.Background(), db, event); err != nil {
		t.Fatalf("CreateAuditEvent() error = %v", err)
	}
	if event.ID == uuid.Nil {
		t.Error("expected CreateAuditEvent to populate a non-nil ID")
	}

	got, err := GetAuditEventByID(context.Background(), db, event.ID)
	if err != nil {
		t.Fatalf("GetAuditEventByID() error = %v", err)
	}
	if got.ResourceIdentifier != "ce-casa-1" || got.AuditType != AuditTypeCEInvoked {
		t.Errorf("got %+v, want resource_identifier=ce-casa-1 audit_type=CE_INVOKED", got)
	}
}

func TestGetAuditEventByID_NotFound(t *testing.T) {
	db := testDB(t)

	_, err := GetAuditEventByID(context.Background(), db, uuid.New())
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestCreateAuditEvent_InvalidResourceType(t *testing.T) {
	db := testDB(t)

	event := &Audit{
		Source:                  SourceCFN,
		ResourceType:            "BOGUS",
		ResourceIdentifier:      "x",
		AuditType:               AuditTypeCEInvoked,
		AuditResourceIdentifier: "x",
		CreatedBy:               uuid.New(),
		LastModifiedBy:          uuid.New(),
	}

	if err := CreateAuditEvent(context.Background(), db, event); err == nil {
		t.Error("expected error for invalid resource_type, got nil")
	}
}

func TestListAuditEvents_FiltersAndPagination(t *testing.T) {
	db := testDB(t)

	for i := 0; i < 3; i++ {
		event := &Audit{
			Source:                  SourceCFN,
			ResourceType:            ResourceTypeCognitionEngine,
			ResourceIdentifier:      "ce-casa-1",
			AuditType:               AuditTypeCEInvoked,
			AuditResourceIdentifier: "mas-123",
			CreatedBy:               uuid.New(),
			LastModifiedBy:          uuid.New(),
		}
		if err := CreateAuditEvent(context.Background(), db, event); err != nil {
			t.Fatalf("CreateAuditEvent() error = %v", err)
		}
	}

	result, err := ListAuditEvents(context.Background(), db, ResourceTypeCognitionEngine, AuditTypeCEInvoked, 0, 2)
	if err != nil {
		t.Fatalf("ListAuditEvents() error = %v", err)
	}
	if result.PageInfo.TotalElements != 3 {
		t.Errorf("TotalElements = %d, want 3", result.PageInfo.TotalElements)
	}
	if len(result.Data) != 2 {
		t.Errorf("len(Data) = %d, want 2 (page size)", len(result.Data))
	}
	if result.PageInfo.Page != 0 || result.PageInfo.PageSize != 2 {
		t.Errorf("PageInfo = %+v, want page=0 pageSize=2", result.PageInfo)
	}
}

func TestListAuditEvents_DefaultsAndClamping(t *testing.T) {
	db := testDB(t)
	defer SetPaginationConfig(FallbackDefaultPageSize, FallbackMaxPageSize)

	for i := 0; i < 3; i++ {
		event := &Audit{
			Source:                  SourceCFN,
			ResourceType:            ResourceTypeCognitionEngine,
			ResourceIdentifier:      "ce-1",
			AuditType:               AuditTypeCEInvoked,
			AuditResourceIdentifier: "ce-1",
			CreatedBy:               uuid.New(),
			LastModifiedBy:          uuid.New(),
		}
		if err := CreateAuditEvent(context.Background(), db, event); err != nil {
			t.Fatalf("CreateAuditEvent() error = %v", err)
		}
	}

	// pageSize<=0 defaults to DefaultPageSize()
	result, err := ListAuditEvents(context.Background(), db, "", "", 0, 0)
	if err != nil {
		t.Fatalf("ListAuditEvents() error = %v", err)
	}
	if result.PageInfo.PageSize != DefaultPageSize() {
		t.Errorf("PageSize = %d, want %d (default)", result.PageInfo.PageSize, DefaultPageSize())
	}

	// pageSize above MaxPageSize is clamped
	result, err = ListAuditEvents(context.Background(), db, "", "", 0, 9999)
	if err != nil {
		t.Fatalf("ListAuditEvents() error = %v", err)
	}
	if result.PageInfo.PageSize != MaxPageSize() {
		t.Errorf("PageSize = %d, want %d (clamped to max)", result.PageInfo.PageSize, MaxPageSize())
	}

	// negative page is treated as 0
	result, err = ListAuditEvents(context.Background(), db, "", "", -3, 2)
	if err != nil {
		t.Fatalf("ListAuditEvents() error = %v", err)
	}
	if result.PageInfo.Page != 0 {
		t.Errorf("Page = %d, want 0 (negative clamped)", result.PageInfo.Page)
	}
}

func TestListAuditEvents_EmptyDB(t *testing.T) {
	db := testDB(t)

	result, err := ListAuditEvents(context.Background(), db, "", "", 0, 10)
	if err != nil {
		t.Fatalf("ListAuditEvents() error = %v", err)
	}
	if len(result.Data) != 0 {
		t.Errorf("Data = %v, want empty", result.Data)
	}
	if result.PageInfo.TotalElements != 0 || result.PageInfo.PageCount != 0 {
		t.Errorf("PageInfo = %+v, want totalElements=0 pageCount=0", result.PageInfo)
	}
}
