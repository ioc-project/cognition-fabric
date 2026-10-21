// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

// CfnConfigPayload represents the configuration payload from the management plane.
type CfnConfigPayload struct {
	ConfigVersion    int64          `json:"config_version"`
	CognitionEngines []EngineCfg    `json:"cognition_engines"`
	Workspaces       []WorkspaceCfg `json:"workspaces"`
}

// EngineCfg represents a Cognition Engine configuration.
type EngineCfg struct {
	ID                   string         `json:"id"`
	CEType               string         `json:"ce_type"` // "CASA" or "DETECTIVE"
	EnforcingURL         string         `json:"enforcing_url"`
	EnforcingEndpoint    string         `json:"enforcing_endpoint"`
	EnforcingProtocol    string         `json:"enforcing_protocol"`
	HealthURL            string         `json:"health_url"`
	HealthEndpoint       string         `json:"health_endpoint"`
	HealthProtocol       string         `json:"health_protocol"`
	NotificationURL      string         `json:"notification_url"`
	NotificationEndpoint string         `json:"notification_endpoint"`
	NotificationProtocol string         `json:"notification_protocol"`
	Enabled              bool           `json:"enabled"`
	Status               string         `json:"status"`
	MASAutoAssociate     bool           `json:"mas_auto_associate"`
	MASConfig            map[string]any `json:"mas_config"`
}

// WorkspaceCfg represents a workspace configuration.
type WorkspaceCfg struct {
	WorkspaceID   string   `json:"workspace_id"`
	WorkspaceName string   `json:"workspace_name"`
	MASList       []MASCfg `json:"multi_agentic_systems"`
}

// MASCfg represents a Multi-Agentic System configuration.
type MASCfg struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	LastUpdatedOn    string         `json:"last_updated_on"`
	CognitionEngines []MASEngineCfg `json:"cognition_engines"`
}

// MASEngineCfg represents a CE associated with a MAS.
type MASEngineCfg struct {
	ID        string         `json:"id"`
	CEType    string         `json:"ce_type"`
	MASConfig map[string]any `json:"mas_config"`
}
