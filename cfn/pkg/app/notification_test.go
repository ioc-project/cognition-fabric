// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"testing"
)

func TestDetectMASChanges_NoChanges(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
					{ID: "mas-2", LastUpdatedOn: "2026-10-10T11:00:00Z"},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
					{ID: "mas-2", LastUpdatedOn: "2026-10-10T11:00:00Z"},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)
	if len(changes) != 0 {
		t.Errorf("expected 0 changes, got %d", len(changes))
	}
}

func TestDetectMASChanges_Created(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
					{ID: "mas-2", LastUpdatedOn: "2026-10-10T11:00:00Z"},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}

	if changes[0].EventType != "mas.created" {
		t.Errorf("expected event_type 'mas.created', got '%s'", changes[0].EventType)
	}

	if changes[0].MASID != "mas-2" {
		t.Errorf("expected mas_id 'mas-2', got '%s'", changes[0].MASID)
	}
}

func TestDetectMASChanges_Updated(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T12:00:00Z"},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}

	if changes[0].EventType != "mas.updated" {
		t.Errorf("expected event_type 'mas.updated', got '%s'", changes[0].EventType)
	}

	if changes[0].MASID != "mas-1" {
		t.Errorf("expected mas_id 'mas-1', got '%s'", changes[0].MASID)
	}
}

func TestDetectMASChanges_Deleted(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
					{ID: "mas-2", LastUpdatedOn: "2026-10-10T11:00:00Z"},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)
	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}

	if changes[0].EventType != "mas.deleted" {
		t.Errorf("expected event_type 'mas.deleted', got '%s'", changes[0].EventType)
	}

	if changes[0].MASID != "mas-2" {
		t.Errorf("expected mas_id 'mas-2', got '%s'", changes[0].MASID)
	}
}

func TestDetectMASChanges_Multiple(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T10:00:00Z"},
					{ID: "mas-2", LastUpdatedOn: "2026-10-10T11:00:00Z"},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{ID: "mas-1", LastUpdatedOn: "2026-10-10T12:00:00Z"}, // updated
					{ID: "mas-3", LastUpdatedOn: "2026-10-10T13:00:00Z"}, // created
					// mas-2 deleted
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)
	if len(changes) != 3 {
		t.Fatalf("expected 3 changes, got %d", len(changes))
	}

	// Verify we have one of each type
	eventTypes := make(map[string]bool)
	for _, change := range changes {
		eventTypes[change.EventType] = true
	}

	if !eventTypes["mas.created"] || !eventTypes["mas.updated"] || !eventTypes["mas.deleted"] {
		t.Errorf("expected created, updated, and deleted events, got: %v", eventTypes)
	}
}

func TestDetectMASChanges_NilConfigs(t *testing.T) {
	changes := detectMASChanges(nil, nil)
	if changes != nil {
		t.Errorf("expected nil changes for nil configs, got %d changes", len(changes))
	}

	oldConfig := &CfnConfigPayload{}
	changes = detectMASChanges(oldConfig, nil)
	if changes != nil {
		t.Errorf("expected nil changes when newConfig is nil, got %d changes", len(changes))
	}

	newConfig := &CfnConfigPayload{}
	changes = detectMASChanges(nil, newConfig)
	if changes != nil {
		t.Errorf("expected nil changes when oldConfig is nil, got %d changes", len(changes))
	}
}
