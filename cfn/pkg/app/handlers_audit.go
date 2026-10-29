// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/audit"
	eh "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
	"github.com/google/uuid"
)

// getAuditEventHandler retrieves a single audit event by ID.
func (a *App) getAuditEventHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	idStr := eh.PathParam(r, "eventId")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid event ID: must be a valid UUID",
		})
	}

	event, err := a.db.GetAuditEventByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, audit.ErrNotFound) {
			return eh.RespondWithJSON(w, http.StatusNotFound, map[string]string{
				"error": "audit event not found",
			})
		}
		getLogger().Errorf("failed to retrieve audit event: id=%s error=%v", id, err)
		return eh.RespondWithJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to retrieve audit event",
		})
	}

	return eh.RespondWithJSON(w, http.StatusOK, event)
}

// listAuditEventsHandler lists audit events with optional filters.
// Internal API - consumed by mgmt-svc's audit passthrough, not exposed in public Swagger documentation.
func (a *App) listAuditEventsHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	resourceType := r.URL.Query().Get("resource_type")
	auditType := r.URL.Query().Get("audit_type")
	filters := audit.ListFilters{Decision: r.URL.Query().Get("decision"), Outcome: r.URL.Query().Get("outcome")}
	if r.URL.Query().Has("success") {
		success, err := strconv.ParseBool(r.URL.Query().Get("success"))
		if err != nil {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid success: expected true or false",
			})
		}
		filters.Success = &success
	}

	page, pageSize, err := parseAuditPagination(r)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}

	result, err := a.db.ListAuditEvents(r.Context(), resourceType, auditType, page, pageSize, filters)
	if err != nil {
		var verr *audit.ValidationError
		if errors.As(err, &verr) {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": err.Error(),
			})
		}
		getLogger().Errorf("failed to list audit events: resource_type=%s audit_type=%s decision=%s success=%s page=%d pageSize=%d error=%v",
			resourceType, auditType, filters.Decision, r.URL.Query().Get("success"), page, pageSize, err)
		return eh.RespondWithJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to list audit events",
		})
	}

	return eh.RespondWithJSON(w, http.StatusOK, result)
}

// parseAuditPagination extracts page and pageSize query parameters from the request.
// page is 0-based (default 0). pageSize defaults to audit.DefaultPageSize and is capped at audit.MaxPageSize.
func parseAuditPagination(r *http.Request) (int, int, error) {
	var err error
	page := 0
	pageSize := audit.DefaultPageSize()

	if p := r.URL.Query().Get("page"); p != "" {
		page, err = strconv.Atoi(p)
		if err != nil || page < 0 {
			return 0, 0, fmt.Errorf("invalid page parameter: must be a non-negative integer")
		}
	}
	if ps := r.URL.Query().Get("pageSize"); ps != "" {
		pageSize, err = strconv.Atoi(ps)
		if err != nil || pageSize < 1 {
			return 0, 0, fmt.Errorf("invalid pageSize parameter: must be a positive integer")
		}
		if pageSize > audit.MaxPageSize() {
			pageSize = audit.MaxPageSize()
		}
	}

	return page, pageSize, nil
}
