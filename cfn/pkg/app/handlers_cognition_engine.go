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
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/app/httpapi/cognitionengine"
	httpclient "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/http"
	eh "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/tools/easyhttp"
	"github.com/google/uuid"
)

// Valid CE types
const (
	protocolGRPC = "grpc"
	protocolHTTP = "http"
)

// supportedProtocols is the protocol CFN can speak for each endpoint purpose today.
var supportedProtocols = map[string]string{
	"enforcing_protocol":    protocolGRPC,
	"health_protocol":       protocolHTTP,
	"notification_protocol": protocolHTTP,
}

// validateProtocol rejects any protocol CFN cannot speak for the given purpose.
func validateProtocol(field, value string) error {
	if want := supportedProtocols[field]; value != want {
		return fmt.Errorf("%s must be '%s' (got: %q)", field, want, value)
	}
	return nil
}

// validateHTTPEndpoint requires an HTTP endpoint to be a path, since CFN appends it to the URL.
func validateHTTPEndpoint(field, value string) error {
	if value != "" && !strings.HasPrefix(value, "/") {
		return fmt.Errorf("%s must start with '/'", field)
	}
	return nil
}

// validateNotification requires notification_url and notification_endpoint to be set together,
// because CFN skips a CE unless it has both.
func validateNotification(notificationURL, notificationEndpoint string) error {
	if (notificationURL == "") != (notificationEndpoint == "") {
		return fmt.Errorf("notification_url and notification_endpoint must be set together")
	}
	return validateHTTPEndpoint("notification_endpoint", notificationEndpoint)
}

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
	// Each purpose has one supported protocol today. An omitted protocol takes that default.
	if req.EnforcingProtocol == "" {
		req.EnforcingProtocol = protocolGRPC
	}
	if req.HealthProtocol == "" {
		req.HealthProtocol = protocolHTTP
	}
	if req.NotificationProtocol == "" {
		req.NotificationProtocol = protocolHTTP
	}
	for field, value := range map[string]string{
		"enforcing_protocol":    req.EnforcingProtocol,
		"health_protocol":       req.HealthProtocol,
		"notification_protocol": req.NotificationProtocol,
	} {
		if err := validateProtocol(field, value); err != nil {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": err.Error(),
			})
		}
	}

	// Enforcing is optional, but its url and endpoint go together: a gRPC address (host:port) has no service name
	if (req.EnforcingURL == "") != (req.EnforcingEndpoint == "") {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "enforcing_url and enforcing_endpoint must be set together",
		})
	}

	// Validate enforcing_url format when given
	// Accept either URL format (http://host:port) or gRPC address format (host:port)
	enforcingURL := req.EnforcingURL
	if enforcingURL != "" {
		if !strings.Contains(enforcingURL, "://") {
			// Assume gRPC address format (host:port), validate it has host and port
			if !strings.Contains(enforcingURL, ":") {
				return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
					"error": "invalid enforcing_url format: must be host:port (for gRPC) or http://host:port (for HTTP)",
				})
			}
		} else {
			// URL format - validate scheme and host
			parsedURL, err := url.Parse(enforcingURL)
			if err != nil || parsedURL.Scheme == "" || parsedURL.Host == "" {
				return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
					"error": "invalid enforcing_url format: must be host:port (for gRPC) or http://host:port (for HTTP)",
				})
			}
		}
	}

	if err := validateHealthURL(req.HealthURL); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}
	if req.HealthEndpoint == "" {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "health_endpoint is required",
		})
	}
	if err := validateHTTPEndpoint("health_endpoint", req.HealthEndpoint); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
	}
	var notificationURL, notificationEndpoint string
	if req.NotificationURL != nil {
		notificationURL = *req.NotificationURL
	}
	if req.NotificationEndpoint != nil {
		notificationEndpoint = *req.NotificationEndpoint
	}
	if err := validateNotification(notificationURL, notificationEndpoint); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
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
		"cfn_id":                CfnID,
		"name":                  req.Name,
		"version":               req.Version,
		"ce_type":               req.CEType,
		"enforcing_protocol":    req.EnforcingProtocol,
		"health_url":            req.HealthURL,
		"health_endpoint":       req.HealthEndpoint,
		"health_protocol":       req.HealthProtocol,
		"notification_protocol": req.NotificationProtocol,
		"mas_auto_associate":    masAutoAssociate,
		"mas_config":            masConfig,
	}

	if req.EnforcingURL != "" {
		payload["enforcing_url"] = req.EnforcingURL
		payload["enforcing_endpoint"] = req.EnforcingEndpoint
	}

	// Add notification fields if provided
	if req.NotificationURL != nil {
		payload["notification_url"] = *req.NotificationURL
	}
	if req.NotificationEndpoint != nil {
		payload["notification_endpoint"] = *req.NotificationEndpoint
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

// patchCognitionEngineHandler handles CE update requests.
//
// @Summary      Update a Cognition Engine
// @Description  Update a CE by ID. CFN forwards the request to the management plane.
// @Tags         cognition-engines
// @Accept       json
// @Produce      json
// @Param        ceId path string true "Cognition Engine ID (UUID)"
// @Param        request body map[string]any true "Fields to update (enforcing_*, health_*, notification_*). Send null to clear enforcing_url, enforcing_endpoint, notification_url or notification_endpoint"
// @Success      200 {object} map[string]any "CE updated successfully"
// @Failure      400 {object} cognitionengine.ErrorResponse "Invalid request"
// @Failure      404 {object} cognitionengine.ErrorResponse "CE not found"
// @Failure      502 {object} cognitionengine.ErrorResponse "Management plane error"
// @Failure      503 {object} cognitionengine.ErrorResponse "CFN not registered"
// @Router       /api/cognition-engine/{ceId} [patch]
func (a *App) patchCognitionEngineHandler(w http.ResponseWriter, r *http.Request) (int, error) {
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

	// Parse the request body
	var reqBody map[string]any
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("invalid JSON body: %v", err),
		})
	}

	if v, ok := reqBody["health_url"]; ok {
		if err := validateHealthURLValue(v); err != nil {
			return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
				"error": err.Error(),
			})
		}
	}

	for _, field := range []string{"enforcing_protocol", "health_protocol", "notification_protocol"} {
		if v, ok := reqBody[field]; ok {
			value, isString := v.(string)
			if !isString {
				return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
					"error": fmt.Sprintf("%s must be a string", field),
				})
			}
			if err := validateProtocol(field, value); err != nil {
				return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
					"error": err.Error(),
				})
			}
		}
	}

	if v, ok := reqBody["health_endpoint"]; ok && v == nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "health_endpoint is required and cannot be cleared",
		})
	}

	// A patch cannot see the stored row, so the "set together" rule is enforced by the management plane.
	// An explicit null clears a field, so only a string endpoint needs the path check.
	for _, field := range []string{"health_endpoint", "notification_endpoint"} {
		if value, ok := reqBody[field].(string); ok {
			if err := validateHTTPEndpoint(field, value); err != nil {
				return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
					"error": err.Error(),
				})
			}
		}
	}

	// CE reconnects must be distinguishable from an administrator saving unchanged endpoint fields.
	mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
	patchURL := fmt.Sprintf("%s/api/cognition-engines/%s?reconnect=true", mgmtURL, ceID)

	requestBody, err := json.Marshal(reqBody)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusInternalServerError, map[string]string{
			"error": fmt.Sprintf("failed to marshal request: %v", err),
		})
	}

	log.Infof("forwarding CE patch request to management plane: %s (ce_id=%s)", patchURL, ceID)

	// Forward the request to the management plane
	client := httpclient.New(30 * time.Second)
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	ctx := context.Background()
	resp, err := client.Patch(ctx, patchURL, requestBody, headers)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to forward request to management plane: %v", err),
		})
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return eh.RespondWithJSON(w, http.StatusBadGateway, map[string]string{
			"error": fmt.Sprintf("failed to read management plane response: %v", err),
		})
	}

	// Parse response
	var respData map[string]any
	if err := json.Unmarshal(respBody, &respData); err != nil {
		respData = map[string]any{"raw": string(respBody)}
	}

	// Forward the management plane's status code and response
	if resp.StatusCode == http.StatusOK {
		log.Infof("CE patched successfully: ce_id=%s", ceID)

		// Trigger config refresh after update
		go func() {
			time.Sleep(500 * time.Millisecond)
			mgmtURL := getEnvOrDefault("MGMT_URL", "http://localhost:9000")
			if err := a.RefreshConfig(mgmtURL); err != nil {
				log.Errorf("failed to refresh config after CE patch: %v", err)
			} else {
				log.Infof("config refreshed after CE patch: ce_id=%s", ceID)
			}
		}()
	} else {
		log.Errorf("CE patch failed: status=%d, body=%v", resp.StatusCode, respData)
	}

	return eh.RespondWithJSON(w, resp.StatusCode, respData)
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

// validateHealthURL checks that a CE health URL is an absolute http or https URL with a hostname
// and without credentials or a fragment.
func validateHealthURL(raw string) error {
	if raw == "" {
		return fmt.Errorf("health_url is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("invalid health_url: must be an http or https URL (for example http://host:port)")
	}
	if parsed.User != nil {
		return fmt.Errorf("invalid health_url: credentials are not allowed")
	}
	if parsed.Fragment != "" {
		return fmt.Errorf("invalid health_url: fragments are not allowed")
	}
	if addr, err := netip.ParseAddr(parsed.Hostname()); err == nil && addr.IsLinkLocalUnicast() {
		// Covers the cloud metadata address 169.254.169.254. Private and loopback ranges stay allowed,
		// since CEs run there.
		return fmt.Errorf("invalid health_url: link-local addresses are not allowed")
	}
	return nil
}

// validateHealthURLValue validates a health_url taken from a decoded JSON body, where it can be any type.
func validateHealthURLValue(v any) error {
	healthURL, ok := v.(string)
	if !ok {
		return fmt.Errorf("health_url must be a string")
	}
	return validateHealthURL(healthURL)
}

const (
	defaultProbeTimeout = time.Second
	maxProbeTimeout     = 10 * time.Second
)

// parseProbeTimeout parses a timeout in seconds. It must be positive and at most 10 seconds.
func parseProbeTimeout(raw string) (time.Duration, error) {
	secs, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("not a number: %q", raw)
	}
	d := time.Duration(secs * float64(time.Second))
	if d <= 0 || d > maxProbeTimeout {
		return 0, fmt.Errorf("must be greater than 0 and at most %s, got %q", maxProbeTimeout, raw)
	}
	return d, nil
}

// probeTimeoutFromEnv reads CE_PROBE_TIMEOUT_SECONDS and falls back to the default if it is
// unset or invalid. It is called once at startup.
func probeTimeoutFromEnv() time.Duration {
	raw := getEnvOrDefault("CE_PROBE_TIMEOUT_SECONDS", "")
	if raw == "" {
		return defaultProbeTimeout
	}
	d, err := parseProbeTimeout(raw)
	if err != nil {
		getLogger().Warnf("invalid CE_PROBE_TIMEOUT_SECONDS, using %s: %v", defaultProbeTimeout, err)
		return defaultProbeTimeout
	}
	return d
}

// getProbeTimeout returns the configured probe timeout, or the default if none was set.
func (a *App) getProbeTimeout() time.Duration {
	if a.probeTimeout <= 0 {
		return defaultProbeTimeout
	}
	return a.probeTimeout
}

// maxProbeRequestBytes caps the probe request body.
const maxProbeRequestBytes = 1 << 10

// probeClient is shared by all probes. It does not use httpclient.New because it must not follow
// redirects (a redirecting health URL is reported unhealthy instead of probing the redirect target)
// and must not use a proxy.
var probeClient = &http.Client{
	Transport:     newProbeTransport(),
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// newProbeTransport returns the default transport without proxy support. CE health URLs are internal
// addresses probed directly: HTTP_PROXY and HTTPS_PROXY would send the probe to the proxy, which can
// answer for a CE that is down or cannot reach it.
func newProbeTransport() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	return t
}

// findEngineHealthURL returns the registered health URL of a CE (health_url joined with health_endpoint)
// from the current config snapshot.
func findEngineHealthURL(ceID string) (string, bool) {
	cfnConfigMutex.RLock()
	defer cfnConfigMutex.RUnlock()
	if ParsedConfig == nil {
		return "", false
	}
	for _, ce := range ParsedConfig.CognitionEngines {
		if ce.ID == ceID {
			return strings.TrimRight(ce.HealthURL, "/") + ce.HealthEndpoint, true
		}
	}
	return "", false
}

// probeCognitionEngineHandler probes a registered CE's health URL on behalf of the management plane.
//
// @Summary      Probe a Cognition Engine
// @Description  Internal. Looks up the CE's registered health_url and performs an unauthenticated HTTP GET against it. A 200 within the probe timeout is healthy, anything else is unhealthy.
// @Tags         internal
// @Accept       json
// @Produce      json
// @Param        request body cognitionengine.ProbeRequest true "Probe request"
// @Success      200 {object} cognitionengine.ProbeResponse "Probe result"
// @Failure      400 {object} cognitionengine.ErrorResponse "Invalid request"
// @Failure      404 {object} cognitionengine.ErrorResponse "CE not yet in CFN config"
// @Router       /api/internal/mgmt/cognition-engine/probe [post]
func (a *App) probeCognitionEngineHandler(w http.ResponseWriter, r *http.Request) (int, error) {
	log := getLogger()

	var req cognitionengine.ProbeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxProbeRequestBytes)).Decode(&req); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("invalid JSON body: %v", err),
		})
	}
	if _, err := uuid.Parse(req.CEID); err != nil {
		return eh.RespondWithJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid ce_id format: must be a valid UUID",
		})
	}

	healthURL, found := findEngineHealthURL(req.CEID)
	if !found {
		return eh.RespondWithJSON(w, http.StatusNotFound, map[string]string{
			"error": "CE not yet in CFN config",
		})
	}
	if err := validateHealthURL(healthURL); err != nil {
		log.Debugf("probe skipped: ce_id=%s: %v", req.CEID, err)
		return eh.RespondWithJSON(w, http.StatusOK, cognitionengine.ProbeResponse{Healthy: false})
	}

	healthy, reason := probeHealthURL(r.Context(), healthURL, a.getProbeTimeout())
	if !healthy {
		log.Debugf("probe unhealthy: ce_id=%s health_url=%s reason=%s", req.CEID, healthURL, reason)
	}
	return eh.RespondWithJSON(w, http.StatusOK, cognitionengine.ProbeResponse{Healthy: healthy})
}

// probeHealthURL performs a GET and reports whether it returned 200 within the timeout. When it did
// not, the second return value says why. The response body is ignored.
func probeHealthURL(ctx context.Context, healthURL string, timeout time.Duration) (bool, string) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
	if err != nil {
		return false, err.Error()
	}
	resp, err := probeClient.Do(req)
	if err != nil {
		return false, err.Error()
	}
	defer resp.Body.Close()
	// Drain a bounded amount so the connection can be reused
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Sprintf("status %d", resp.StatusCode)
	}
	return true, ""
}
