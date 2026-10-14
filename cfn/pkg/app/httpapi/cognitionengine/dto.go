// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package cognitionengine provides DTOs for the cognition engine registration API.
package cognitionengine

// RegisterRequest represents a CE registration request from CE to CFN.
// @Description CE registration request payload. The CE sends this to CFN, which adds cfn_id and forwards to management plane.
type RegisterRequest struct {
	// CE name (e.g., "casa-ce")
	Name string `json:"name" example:"casa-ce"`
	// CE version (e.g., "1.0.0")
	Version string `json:"version" example:"1.0.0"`
	// CE type - must be "CASA" or "DETECTIVE"
	CEType string `json:"ce_type" example:"CASA" enums:"CASA,DETECTIVE"`
	// Base URL for the CE service
	BaseURL string `json:"base_url" example:"http://casa-ce:8080"`
	// API endpoint path
	Endpoint string `json:"endpoint" example:"/authorize"`
	// Full URL CFN probes with an HTTP GET to check the CE is alive (required, http or https)
	HealthURL string `json:"health_url" example:"http://casa-ce:8080/healthz"`
	// Auto-associate with all MAS in the workspace (defaults to true if not specified)
	MASAutoAssociate *bool `json:"mas_auto_associate,omitempty" example:"true"`
	// Factory defaults for per-MAS configuration
	MASConfig map[string]any `json:"mas_config,omitempty"`
}

// RegisterResponse represents the response returned to the CE after successful registration.
// @Description CE registration response from management plane.
type RegisterResponse struct {
	// Cognition Engine ID (UUID)
	CEID string `json:"ce_id" example:"550e8400-e29b-41d4-a716-446655440000"`
	// Cognition Fabric Node ID (UUID)
	CFNID string `json:"cfn_id" example:"660e8400-e29b-41d4-a716-446655440001"`
	// CE name
	Name string `json:"name" example:"casa-ce"`
	// CE version
	Version string `json:"version" example:"1.0.0"`
	// CE type
	CEType string `json:"ce_type" example:"CASA"`
	// Base URL for the CE service
	BaseURL string `json:"base_url" example:"http://casa-ce:8080"`
	// API endpoint path
	Endpoint string `json:"endpoint" example:"/authorize"`
	// Health check URL probed by CFN
	HealthURL string `json:"health_url" example:"http://casa-ce:8080/healthz"`
	// Whether the CE is enabled
	Enabled bool `json:"enabled" example:"true"`
	// Auto-associate with all MAS
	MASAutoAssociate bool `json:"mas_auto_associate" example:"false"`
	// CE status (online/offline)
	Status string `json:"status" example:"offline"`
	// Whether this was a new registration (true) or update (false)
	Created bool `json:"created" example:"true"`
}

// ProbeRequest is the internal request the management plane sends to CFN to probe a CE.
// @Description Request to probe a CE. CFN looks up the CE's registered health_url.
type ProbeRequest struct {
	// Cognition Engine ID (UUID)
	CEID string `json:"ce_id" example:"550e8400-e29b-41d4-a716-446655440000"`
}

// ProbeResponse is the result of a CE health probe.
// @Description Result of a CE health probe.
type ProbeResponse struct {
	// True when the health URL answered 200 within the probe timeout
	Healthy bool `json:"healthy" example:"true"`
}

// ErrorResponse represents an error response.
// @Description Error response payload.
type ErrorResponse struct {
	// Error message
	Error string `json:"error" example:"ce_type is required"`
}

// ConflictResponse represents a 409 Conflict response when CE with same (name, version) already exists.
// @Description Conflict response with existing CE ID for recovery.
type ConflictResponse struct {
	// Error message
	Error string `json:"error" example:"CE 'casa-ce' version '1.0.0' already exists"`
	// ID of the existing CE with same (name, version)
	ExistingCEID string `json:"existing_ce_id" example:"550e8400-e29b-41d4-a716-446655440000"`
}
