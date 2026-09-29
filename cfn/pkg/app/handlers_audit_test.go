// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/database"
)

func newTestApp() *App {
	return &App{db: database.NewMockDatabase()}
}

func requireNoError(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGetAuditEventHandler(t *testing.T) {
	a := newTestApp()

	event := &audit.Audit{
		ResourceType:            audit.ResourceTypeCognitionEngine,
		ResourceIdentifier:      "ce-1",
		AuditType:               audit.AuditTypeCEInvoked,
		AuditResourceIdentifier: "mas-1",
		CreatedBy:               uuid.New(),
		LastModifiedBy:          uuid.New(),
	}
	requireNoError(t, a.db.CreateAuditEvent(context.Background(), event))

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit/"+event.ID.String(), nil)
	req.SetPathValue("eventId", event.ID.String())
	rr := httptest.NewRecorder()

	code, err := a.getAuditEventHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.Audit
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ID != event.ID {
		t.Errorf("expected ID %s, got %s", event.ID, resp.ID)
	}
}

func TestGetAuditEventHandler_InvalidUUID(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit/not-a-uuid", nil)
	req.SetPathValue("eventId", "not-a-uuid")
	rr := httptest.NewRecorder()

	code, _ := a.getAuditEventHandler(rr, req)
	if code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", code)
	}
}

func TestGetAuditEventHandler_NotFound(t *testing.T) {
	a := newTestApp()

	id := uuid.New()
	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit/"+id.String(), nil)
	req.SetPathValue("eventId", id.String())
	rr := httptest.NewRecorder()

	code, _ := a.getAuditEventHandler(rr, req)
	if code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", code)
	}
}

func createTestEvent(t *testing.T, a *App, resourceType, auditType string) {
	t.Helper()
	e := &audit.Audit{
		ResourceType:            resourceType,
		ResourceIdentifier:      "res-1",
		AuditType:               auditType,
		AuditResourceIdentifier: "res-1",
		CreatedBy:               uuid.New(),
		LastModifiedBy:          uuid.New(),
	}
	requireNoError(t, a.db.CreateAuditEvent(context.Background(), e))
}

func TestListAuditEventsHandler(t *testing.T) {
	a := newTestApp()
	for i := 0; i < 3; i++ {
		createTestEvent(t, a, audit.ResourceTypeCognitionEngine, audit.AuditTypeCEInvoked)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit", nil)
	rr := httptest.NewRecorder()

	code, err := a.listAuditEventsHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.AuditListResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Data) != 3 {
		t.Errorf("expected 3 events, got %d", len(resp.Data))
	}
	if resp.PageInfo.TotalElements != 3 {
		t.Errorf("expected totalElements=3, got %d", resp.PageInfo.TotalElements)
	}
	if resp.PageInfo.PageSize != audit.DefaultPageSize() {
		t.Errorf("expected pageSize=%d, got %d", audit.DefaultPageSize(), resp.PageInfo.PageSize)
	}
}

func TestListAuditEventsHandler_WithFilters(t *testing.T) {
	a := newTestApp()
	createTestEvent(t, a, audit.ResourceTypeCognitionEngine, audit.AuditTypeCEInvoked)

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?resource_type=COGNITION_ENGINE&audit_type=CE_INVOKED", nil)
	rr := httptest.NewRecorder()

	code, err := a.listAuditEventsHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.AuditListResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Data) != 1 || resp.Data[0].ResourceType != audit.ResourceTypeCognitionEngine {
		t.Errorf("expected 1 matching event, got %+v", resp.Data)
	}
}

func TestListAuditEventsHandler_WithPagination(t *testing.T) {
	a := newTestApp()
	for i := 0; i < 5; i++ {
		createTestEvent(t, a, audit.ResourceTypeCognitionEngine, audit.AuditTypeCEInvoked)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?page=0&pageSize=2", nil)
	rr := httptest.NewRecorder()

	code, err := a.listAuditEventsHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.AuditListResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Data) != 2 || resp.PageInfo.TotalElements != 5 {
		t.Errorf("expected 2 events of 5 total, got %d of %d", len(resp.Data), resp.PageInfo.TotalElements)
	}
}

func TestListAuditEventsHandler_PageSizeExceedsMax(t *testing.T) {
	a := newTestApp()
	createTestEvent(t, a, audit.ResourceTypeCognitionEngine, audit.AuditTypeCEInvoked)

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?pageSize=99999", nil)
	rr := httptest.NewRecorder()

	code, err := a.listAuditEventsHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.AuditListResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.PageInfo.PageSize != audit.MaxPageSize() {
		t.Errorf("expected pageSize clamped to %d, got %d", audit.MaxPageSize(), resp.PageInfo.PageSize)
	}
}

func TestListAuditEventsHandler_InvalidPage(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?page=abc", nil)
	rr := httptest.NewRecorder()

	code, _ := a.listAuditEventsHandler(rr, req)
	if code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", code)
	}
}

func TestListAuditEventsHandler_InvalidPageSize(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?pageSize=-1", nil)
	rr := httptest.NewRecorder()

	code, _ := a.listAuditEventsHandler(rr, req)
	if code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", code)
	}
}

func TestListAuditEventsHandler_InvalidResourceTypeFilter(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?resource_type=BOGUS", nil)
	rr := httptest.NewRecorder()

	code, _ := a.listAuditEventsHandler(rr, req)
	if code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", code)
	}
}

func TestListAuditEventsHandler_InvalidAuditTypeFilter(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?audit_type=BOGUS", nil)
	rr := httptest.NewRecorder()

	code, _ := a.listAuditEventsHandler(rr, req)
	if code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", code)
	}
}

func TestListAuditEventsHandler_EmptyStore(t *testing.T) {
	a := newTestApp()

	req := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit", nil)
	rr := httptest.NewRecorder()

	code, err := a.listAuditEventsHandler(rr, req)
	requireNoError(t, err)
	if code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", code)
	}

	var resp audit.AuditListResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(resp.Data) != 0 || resp.PageInfo.TotalElements != 0 {
		t.Errorf("expected empty result, got %+v", resp)
	}
}
