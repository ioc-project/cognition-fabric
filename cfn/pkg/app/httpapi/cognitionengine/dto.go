// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package cognitionengine provides DTOs for the cognition engine registration API.
package cognitionengine

// RegisterRequest represents a CE registration request from CE to CFN.
// @Description CE registration request payload. The CE sends this to CFN, which adds cfn_id and forwards to management plane.
type RegisterRequest struct {
	// CE name (e.g., "my-ce")
	Name string `json:"name" example:"my-ce"`
	// CE version (e.g., "1.0.0")
	Version string `json:"version" example:"1.0.0"`
	// CE type - must be "CASA" or "DETECTIVE"
	CEType string `json:"ce_type" example:"CASA" enums:"CASA,DETECTIVE"`
	// Address CFN sends enforcement requests to (gRPC host:port, e.g. "my-ce:50051")
	EnforcingURL string `json:"enforcing_url" example:"my-ce:50051"`
	// gRPC service name for enforcement (required for gRPC)
	EnforcingEndpoint string `json:"enforcing_endpoint,omitempty" example:"ioc.ce.v1.CognitionEngine"`
	// Enforcement protocol. Only "grpc" is supported today (default "grpc")
	EnforcingProtocol string `json:"enforcing_protocol,omitempty" example:"grpc" enums:"grpc"`
	// URL CFN probes with an HTTP GET to check the CE is alive (required, http or https)
	HealthURL string `json:"health_url" example:"http://my-ce:8080/healthz"`
	// Reserved. Health checks are HTTP, so CFN probes health_url as given. Must start with "/"
	HealthEndpoint string `json:"health_endpoint,omitempty" example:"/healthz"`
	// Health protocol. Only "http" is supported today (default "http")
	HealthProtocol string `json:"health_protocol,omitempty" example:"http" enums:"http"`
	// Notification base URL for MAS event notifications
	NotificationURL *string `json:"notification_url,omitempty" example:"http://my-ce:8080"`
	// Path CFN appends to notification_url. Must start with "/" and be set together with notification_url
	NotificationEndpoint *string `json:"notification_endpoint,omitempty" example:"/notification/mas-lifecycle"`
	// Notification protocol. Only "http" is supported today (default "http")
	NotificationProtocol string `json:"notification_protocol,omitempty" example:"http" enums:"http"`
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
	Name string `json:"name" example:"my-ce"`
	// CE version
	Version string `json:"version" example:"1.0.0"`
	// CE type
	CEType string `json:"ce_type" example:"CASA"`
	// Address CFN sends enforcement requests to
	EnforcingURL string `json:"enforcing_url" example:"my-ce:50051"`
	// gRPC service name for enforcement
	EnforcingEndpoint *string `json:"enforcing_endpoint,omitempty" example:"ioc.ce.v1.CognitionEngine"`
	// Enforcement protocol
	EnforcingProtocol string `json:"enforcing_protocol" example:"grpc"`
	// Health check URL probed by CFN
	HealthURL string `json:"health_url" example:"http://my-ce:8080/healthz"`
	// Reserved. Health checks are HTTP, so CFN probes health_url as given
	HealthEndpoint *string `json:"health_endpoint,omitempty" example:"/healthz"`
	// Health protocol
	HealthProtocol string `json:"health_protocol" example:"http"`
	// Notification base URL for MAS event notifications
	NotificationURL *string `json:"notification_url,omitempty" example:"http://my-ce:8080"`
	// Notification endpoint path for MAS event notifications
	NotificationEndpoint *string `json:"notification_endpoint,omitempty" example:"/notification/mas-lifecycle"`
	// Notification protocol
	NotificationProtocol string `json:"notification_protocol" example:"http"`
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
	Error string `json:"error" example:"CE 'my-ce' version '1.0.0' already exists"`
	// ID of the existing CE with same (name, version)
	ExistingCEID string `json:"existing_ce_id" example:"550e8400-e29b-41d4-a716-446655440000"`
}

// MASLifecycleNotification represents the payload sent to CE notification endpoints for MAS lifecycle events.
// @Description Notification payload for MAS lifecycle events (create, update, delete).
type MASLifecycleNotification struct {
	// Event type - must be "mas.created", "mas.updated", or "mas.deleted"
	EventType string `json:"event_type" example:"mas.created" enums:"mas.created,mas.updated,mas.deleted"`
	// Timestamp in RFC3339 format
	Timestamp string `json:"timestamp" example:"2026-10-08T13:45:00Z"`
	// MAS ID that was created, updated, or deleted
	MASID string `json:"mas_id" example:"550e8400-e29b-41d4-a716-446655440000"`
}
