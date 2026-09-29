// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/app/httpapi/cognitionengine"
	httpclient "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/http"
	eh "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
	"github.com/google/uuid"
)

// Valid CE types
var validCETypes = map[string]bool{
	"CASA":      true,
	"DETECTIVE": true,
}

// registerCognitionEngineHandler handles CE registration requests.
//
// @Summary      Register a Cognition Engine
// @Description  Register a CE with the CFN. The CFN adds cfn_id and forwards the request to the management plane.
// @Tags         cognition-engines
// @Accept       json
// @Produce      json
// @Param        request body cognitionengine.RegisterRequest true "CE Registration Request"
// @Success      200 {object} cognitionengine.RegisterResponse "CE registered successfully"
// @Failure      400 {object} cognitionengine.ErrorResponse "Invalid request"
// @Failure      502 {object} cognitionengine.ErrorResponse "Management plane error"
// @Failure      503 {object} cognitionengine.ErrorResponse "CFN not registered"
// @Router       /api/cognition-engine [post]
func (a *App) registerCognitionEngineHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	// Parse the CE registration request
	var req cognitionengine.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("invalid JSON body: %v", err),
		})
	}

	// Validate required fields
	if req.Name == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "name is required",
		})
	}
	if req.Version == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "version is required",
		})
	}
	if req.CEType == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "ce_type is required",
		})
	}
	if !validCETypes[req.CEType] {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("ce_type must be one of: CASA, DETECTIVE (got: %s)", req.CEType),
		})
	}
	if req.BaseURL == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "base_url is required",
		})
	}
	if req.Endpoint == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "endpoint is required",
		})
	}

	// Validate base_url format
	// Accept either URL format (http://host:port) or gRPC address format (host:port)
	baseURL := req.BaseURL
	if !strings.Contains(baseURL, "://") {
		// Assume gRPC address format (host:port), validate it has host and port
		if !strings.Contains(baseURL, ":") {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid base_url format: must be host:port (for gRPC) or http://host:port (for HTTP)",
			})
		}
	} else {
		// URL format - validate scheme and host
		parsedURL, err := url.Parse(baseURL)
		if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid base_url format: must be host:port (for gRPC) or http://host:port (for HTTP)",
			})
		}
	}

	// Check if this CFN is registered with the management plane
	if CfnID == "" {
		return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "CFN not registered with management plane yet",
		})
	}

	// Build the forwarding request with CFN context added
	mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
	registerURL := mgmtURL + "/api/cognition-engines"

	// Ensure nil map becomes empty object in JSON
	masConfig := req.MASConfig
	if masConfig == nil {
		masConfig = map[string]any{}
	}

	// Default mas_auto_associate to true if not specified
	masAutoAssociate := true
	if req.MASAutoAssociate != nil {
		masAutoAssociate = *req.MASAutoAssociate
	}

	payload := map[string]any{
		"cfn_id":             CfnID,
		"name":               req.Name,
		"version":            req.Version,
		"ce_type":            req.CEType,
		"base_url":           req.BaseURL,
		"endpoint":           req.Endpoint,
		"mas_auto_associate": masAutoAssociate,
		"mas_config":         masConfig,
	}

	requestBody, err := json.Marshal(payload)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to marshal request: %v", err),
		})
	}

	log.Infof("forwarding CE registration to management plane: %s (name=%s, version=%s, ce_type=%s, cfn_id=%s)",
		registerURL, req.Name, req.Version, req.CEType, CfnID)

	// Forward the request to the management plane
	client := httpclient.New(30 * time.Second)
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	ctx := context.Background()
	resp, err := client.Post(ctx, registerURL, requestBody, headers)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to forward request to management plane: %v", err),
		})
	}
	defer resp.Body.Close()

	// Read and parse management plane response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to read management plane response: %v", err),
		})
	}

	// If management plane returned an error status, forward it to the CE
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		var errorResp map[string]any
		if err := json.Unmarshal(respBody, &errorResp); err != nil {
			errorResp = map[string]any{"raw": string(respBody)}
		}
		log.Errorf("management plane returned error: status=%d, body=%v", resp.StatusCode, errorResp)
		return eh.RespondWithJSON(w, resp.StatusCode, errorResp)
	}

	// Parse successful response
	var mgmtResp cognitionengine.RegisterResponse
	if err := json.Unmarshal(respBody, &mgmtResp); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to parse management plane response: %v", err),
		})
	}

	log.Infof("CE registered successfully: ce_id=%s, cfn_id=%s, ce_type=%s", mgmtResp.CEID, mgmtResp.CFNID, mgmtResp.CEType)

	// Trigger immediate config refresh to include the newly registered CE
	go func() {
		time.Sleep(500 * time.Millisecond) // Brief delay for mgmt plane to propagate
		mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
		if err := a.RefreshConfig(mgmtURL); err != nil {
			log.Errorf("failed to refresh config after CE registration: %v", err)
		} else {
			log.Infof("config refreshed after CE registration: ce_id=%s", mgmtResp.CEID)
		}
	}()

	// Forward the management plane's status code (201 for new, 200 for update)
	return eh.RespondWithJSON(w, resp.StatusCode, mgmtResp)
}

// cognitionEngineHeartbeatHandler handles CE heartbeat requests.
//
// @Summary      CE Heartbeat
// @Description  Send heartbeat to maintain CE online status. CFN forwards to management plane.
// @Tags         cognition-engines
// @Produce      json
// @Param        ceId path string true "Cognition Engine ID (UUID)"
// @Success      200 {object} cognitionengine.HeartbeatResponse "Heartbeat acknowledged"
// @Failure      400 {object} cognitionengine.ErrorResponse "Invalid CE ID"
// @Failure      502 {object} cognitionengine.ErrorResponse "Management plane error"
// @Failure      503 {object} cognitionengine.ErrorResponse "CFN not registered"
// @Router       /api/cognition-engine/{ceId}/heartbeat [put]
func (a *App) cognitionEngineHeartbeatHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	ceID := eh.PathParam(r, "ceId")
	if ceID == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "ce_id is required",
		})
	}

	// Validate ceID is a valid UUID
	if _, err := uuid.Parse(ceID); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid ce_id format: must be a valid UUID",
		})
	}

	// Check if this CFN is registered with the management plane
	if CfnID == "" {
		return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "CFN not registered with management plane yet",
		})
	}

	// Build the heartbeat URL for management plane
	mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
	heartbeatURL := fmt.Sprintf("%s/api/cognition-engines/%s/heartbeat", mgmtURL, ceID)

	log.Debugf("forwarding CE heartbeat to management plane: %s (ce_id=%s)", heartbeatURL, ceID)

	// Forward the heartbeat to the management plane (PUT with no body)
	client := httpclient.New(10 * time.Second)
	headers := map[string]string{
		"Accept": "application/json",
	}

	ctx := context.Background()
	resp, err := client.Put(ctx, heartbeatURL, nil, headers)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to forward heartbeat to management plane: %v", err),
		})
	}
	defer resp.Body.Close()

	// Read management plane response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to read management plane response: %v", err),
		})
	}

	// If management plane returned an error status, forward it to the CE
	if resp.StatusCode != http.StatusOK {
		var errorResp map[string]any
		if err := json.Unmarshal(respBody, &errorResp); err != nil {
			errorResp = map[string]any{"raw": string(respBody)}
		}
		log.Errorf("management plane heartbeat failed: status=%d, body=%v", resp.StatusCode, errorResp)
		return eh.RespondWithJSON(w, resp.StatusCode, errorResp)
	}

	// Parse successful response
	var hbResp cognitionengine.HeartbeatResponse
	if err := json.Unmarshal(respBody, &hbResp); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to parse management plane response: %v", err),
		})
	}

	log.Debugf("CE heartbeat acknowledged: ce_id=%s, status=%s", ceID, hbResp.Status)

	// Return the successful response to the CE
	return eh.RespondWithJSON(w, http.StatusOK, hbResp)
}

// deleteCognitionEngineHandler handles CE unregistration/deletion requests.
//
// @Summary      Unregister/Delete a Cognition Engine
// @Description  Unregister (soft-delete) a CE by ID. CFN forwards the request to the management plane.
// @Tags         cognition-engines
// @Produce      json
// @Param        ceId path string true "Cognition Engine ID (UUID)"
// @Success      204 "CE deleted successfully"
// @Failure      400 {object} cognitionengine.ErrorResponse "Invalid CE ID"
// @Failure      404 {object} cognitionengine.ErrorResponse "CE not found"
// @Failure      502 {object} cognitionengine.ErrorResponse "Management plane error"
// @Failure      503 {object} cognitionengine.ErrorResponse "CFN not registered"
// @Router       /api/cognition-engine/{ceId} [delete]
func (a *App) deleteCognitionEngineHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	ceID := eh.PathParam(r, "ceId")
	if ceID == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "ce_id is required",
		})
	}

	// Validate ceID is a valid UUID
	if _, err := uuid.Parse(ceID); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid ce_id format: must be a valid UUID",
		})
	}

	// Check if this CFN is registered with the management plane
	if CfnID == "" {
		return eh.RespondWithJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "CFN not registered with management plane yet",
		})
	}

	// Build the delete URL for management plane
	mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
	deleteURL := fmt.Sprintf("%s/api/cognition-engines/%s", mgmtURL, ceID)

	log.Infof("forwarding CE delete request to management plane: %s (ce_id=%s)", deleteURL, ceID)

	// Forward the request to the management plane
	client := httpclient.New(30 * time.Second)
	headers := map[string]string{
		"Accept": "application/json",
	}

	ctx := context.Background()
	resp, err := client.Delete(ctx, deleteURL, nil, headers)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to forward request to management plane: %v", err),
		})
	}
	defer resp.Body.Close()

	// Management plane returns 204 No Content on success
	if resp.StatusCode == http.StatusNoContent {
		log.Infof("CE deleted successfully: ce_id=%s", ceID)

		// Trigger config refresh after deletion
		go func() {
			time.Sleep(500 * time.Millisecond)
			mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
			if err := a.RefreshConfig(mgmtURL); err != nil {
				log.Errorf("failed to refresh config after CE deletion: %v", err)
			} else {
				log.Infof("config refreshed after CE deletion: ce_id=%s", ceID)
			}
		}()

		w.WriteHeader(http.StatusNoContent)
		return http.StatusNoContent, nil
	}

	// Read error response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Errorf("failed to read response body: %v", err)
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": "failed to process delete request",
		})
	}

	var errorResp map[string]any
	if err := json.Unmarshal(respBody, &errorResp); err != nil {
		errorResp = map[string]any{"raw": string(respBody)}
	}
	log.Errorf("cognition engine delete failed: status=%d, body=%v", resp.StatusCode, errorResp)
	return eh.RespondWithJSON(w, resp.StatusCode, errorResp)
}
