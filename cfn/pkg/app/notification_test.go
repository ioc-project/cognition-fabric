// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"testing"
)

func TestDetectMASChanges_TimestampRepresentations(t *testing.T) {
	cases := []struct {
		name, before, after string
		changed             bool
	}{
		{"same instant with offset", "2026-11-11T12:00:00Z", "2026-11-11T14:00:00+02:00", false},
		{"fractional spelling", "2026-11-11T12:00:00.123456Z", "2026-11-11T12:00:00.123456000+00:00", false},
		{"whole second spelling", "2026-11-11T12:00:00Z", "2026-11-11T12:00:00.000000Z", false},
		{"different instant", "2026-11-11T12:00:00.123456Z", "2026-11-11T12:00:00.123457Z", true},
		{"same empty", "", "", false},
		{"same legacy naive", "2026-11-11T12:00:00", "2026-11-11T12:00:00", false},
		{"legacy zone must not be guessed", "2026-11-11T12:00:00", "2026-11-11T12:00:00Z", true},
		{"changed malformed", "unknown", "invalid", true},
	}
	config := func(stamp string) *CfnConfigPayload {
		return &CfnConfigPayload{Workspaces: []WorkspaceCfg{{MASList: []MASCfg{{ID: "mas-1", LastUpdatedOn: stamp}}}}}
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			changes := detectMASChanges(config(tc.before), config(tc.after))
			if (len(changes) != 0) != tc.changed {
				t.Fatalf("changes = %+v, changed = %v", changes, tc.changed)
			}
			if tc.changed && (len(changes) != 1 || changes[0].EventType != "mas.updated") {
				t.Fatalf("unexpected changes: %+v", changes)
			}
		})
	}
	if changes := detectMASChanges(nil, config("2026-11-11T12:00:00Z")); len(changes) != 0 {
		t.Fatalf("initial registration must establish a baseline without notifications: %+v", changes)
	}
}

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
