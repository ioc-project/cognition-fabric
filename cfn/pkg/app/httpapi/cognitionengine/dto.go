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
	// Whether the CE is enabled
	Enabled bool `json:"enabled" example:"true"`
	// Auto-associate with all MAS
	MASAutoAssociate bool `json:"mas_auto_associate" example:"false"`
	// CE status (online/offline)
	Status string `json:"status" example:"offline"`
	// Whether this was a new registration (true) or update (false)
	Created bool `json:"created" example:"true"`
}

// HeartbeatResponse represents the response returned to the CE after a successful heartbeat.
// @Description CE heartbeat response.
type HeartbeatResponse struct {
	// CE status after heartbeat
	Status string `json:"status" example:"online"`
	// Last seen timestamp (RFC3339)
	LastSeen string `json:"last_seen" example:"2026-08-14T10:30:00Z"`
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
