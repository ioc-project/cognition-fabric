// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	eh "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
)

// getMASHandler handles GET /api/multi-agentic-systems/{masId}
//
// @Summary      Get MAS details
// @Description  Get details of a specific Multi-Agentic System. Proxies to management plane.
// @Tags         multi-agentic-systems
// @Produce      json
// @Param        masId path string true "MAS ID"
// @Success      200 {object} mgmt.MASResponse "MAS details"
// @Failure      404 {object} map[string]string "MAS not found"
// @Failure      500 {object} map[string]string "Internal error"
// @Failure      503 {object} map[string]string "Management plane unavailable"
// @Router       /api/multi-agentic-systems/{masId} [get]
func (a *App) getMASHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	masID := eh.PathParam(r, "masId")

	if masID == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "mas_id is required",
		})
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	mas, workspaceID, err := fetchMASForRequest(ctx, masID, a.RefreshConfig)
	if err != nil {
		switch {
		case errors.Is(err, errMgmtURLNotConfigured):
			log.Errorf("management plane URL not set")
			return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "management plane not configured",
			})
		case errors.Is(err, errSnapshotUnavailable):
			log.Errorf("config snapshot unavailable: mas_id=%s", masID)
			return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "config snapshot unavailable",
			})
		case errors.Is(err, errMASNotAssigned), errors.Is(err, errMASNotFound):
			log.Warnf("MAS not found: mas_id=%s", masID)
			return eh.RespondWithJSON(w, http.StatusNotFound, map[string]string{
				"error": fmt.Sprintf("MAS not found: %s", masID),
			})
		default:
			log.Errorf("failed to fetch MAS from management plane: mas_id=%s workspace_id=%s error=%v", masID, workspaceID, err)
			return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
				"error": "failed to fetch MAS from management plane",
			})
		}
	}

	return eh.RespondWithJSON(w, http.StatusOK, mas)
}
