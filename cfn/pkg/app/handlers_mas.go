// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/client/mgmt"
	eh "github.com/cisco-eti/cognition-fabric/cfn/pkg/tools/easyhttp"
)

// getMASHandler handles GET /api/multi-agentic-systems/{masId}
//
// @Summary      Get MAS details
// @Description  Get MAS details from Management using its assigned workspace. Default response preserves the legacy CE contract; metadata=true opts into persisted onboarding metadata.
// @Tags         multi-agentic-systems
// @Produce      json
// @Param        metadata query boolean false "Opt in to expanded onboarding metadata; legacy shape is the default"
// @Param        masId path string true "MAS ID"
// @Success      200 {object} cognitionengine.LegacyMASResponse "Default legacy response; metadata=true returns expanded mgmt.MASResponse, specified in api/ce/openapi/cfn-ce.yaml"
// @Failure      400 {object} map[string]string "mas_id is required"
// @Failure      404 {object} map[string]string "MAS not found"
// @Failure      500 {object} map[string]string "Internal error"
// @Failure      502 {object} map[string]string "Failed to fetch MAS from management plane"
// @Failure      503 {object} map[string]string "Config snapshot or management plane unavailable"
// @Router       /api/multi-agentic-systems/{masId} [get]
func (a *App) getMASHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	masID := eh.PathParam(r, "masId")

	if masID == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "mas_id is required",
		})
	}

	workspaceID, err := resolveMASWorkspace(masID)
	if err != nil {
		switch {
		case errors.Is(err, errMASNotAssigned):
			log.Warnf("MAS not found: mas_id=%s", masID)
			return eh.RespondWithJSON(w, http.StatusNotFound, map[string]string{
				"error": fmt.Sprintf("MAS not found: %s", masID),
			})
		case errors.Is(err, errSnapshotUnavailable):
			log.Errorf("config snapshot unavailable: mas_id=%s", masID)
			return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "config snapshot unavailable",
			})
		default:
			log.Errorf("failed to resolve MAS workspace: mas_id=%s error=%v", masID, err)
			return eh.RespondWithJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "failed to resolve MAS workspace",
			})
		}
	}

	// Check management plane URL is available
	if MgmtURL == "" {
		log.Errorf("management plane URL not set")
		return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "management plane not configured",
		})
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	mgmtClient := mgmt.New(MgmtURL, 30*time.Second)
	mas, err := mgmtClient.GetMAS(ctx, workspaceID, masID)
	if err != nil {
		if errors.Is(err, mgmt.ErrNotFound) {
			log.Warnf("MAS not found: mas_id=%s", masID)
			return eh.RespondWithJSON(w, http.StatusNotFound, map[string]string{
				"error": fmt.Sprintf("MAS not found: %s", masID),
			})
		}
		log.Errorf("failed to fetch MAS from management plane: %v", err)
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": "failed to fetch MAS from management plane",
		})
	}

	// Keep the historical representation for existing binary CEs. Expanded
	// metadata is explicit until their actual decoders have been qualified.
	if r.URL.Query().Get("metadata") != "true" {
		return eh.RespondWithJSON(w, http.StatusOK, legacyMAS(mas))
	}
	for _, field := range []struct {
		name  string
		value *json.RawMessage
	}{
		{"updated_at", &mas.UpdatedAt},
		{"created_at", &mas.CreatedAt},
	} {
		normalized, err := normalizeUTCTimestamp(*field.value)
		if err != nil {
			log.Warnw("omitting invalid MAS timestamp", "mas_id", masID, "field", field.name, "reason", err.Error())
		}
		*field.value = normalized
	}
	return eh.RespondWithJSON(w, http.StatusOK, mas)
}

// legacyMAS deliberately fixes the historical response keys, including CE keys.
func legacyMAS(mas *mgmt.MASResponse) map[string]interface{} {
	ces := make([]map[string]interface{}, 0, len(mas.CognitionEngines))
	for _, ce := range mas.CognitionEngines {
		ces = append(ces, map[string]interface{}{
			"ce_id": ce.CEID, "name": ce.Name, "version": ce.Version, "ce_type": ce.CEType,
			"enforcing_url": ce.EnforcingURL, "enforcing_endpoint": ce.EnforcingEndpoint,
			"enforcing_protocol": ce.EnforcingProtocol, "enabled": ce.Enabled, "status": ce.Status,
		})
	}
	var engines interface{} = ces
	if mas.CognitionEngines == nil {
		engines = nil
	}
	return map[string]interface{}{"id": mas.ID, "workspace_id": mas.WorkspaceID, "name": mas.Name, "cognition_engines": engines}
}

// Expanded top-level timestamps must carry an explicit zone and are emitted as UTC.
// Missing/null values are omitted; invalid values are omitted with an error to log.
func normalizeUTCTimestamp(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("invalid timestamp: %w", err)
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return nil, fmt.Errorf("expected RFC 3339 timestamp with an explicit zone: %w", err)
	}
	encoded, err := json.Marshal(parsed.UTC().Format(time.RFC3339Nano))
	return json.RawMessage(encoded), err
}
