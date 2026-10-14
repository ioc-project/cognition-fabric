// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"testing"
)

// TestNotificationChangeDetection tests MAS change detection logic
func TestNotificationChangeDetection(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T11:00:00Z", // Updated timestamp
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
					{
						ID:            "mas-2", // New MAS
						LastUpdatedOn: "2026-10-12T11:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)

	if len(changes) != 2 {
		t.Fatalf("Expected 2 changes, got %d", len(changes))
	}

	// Verify mas.updated event
	foundUpdate := false
	foundCreate := false
	for _, change := range changes {
		if change.EventType == "mas.updated" && change.MASID == "mas-1" {
			foundUpdate = true
			if len(change.AssociatedCEIDs) != 1 || change.AssociatedCEIDs[0] != "ce-1" {
				t.Error("mas.updated has wrong associated CEs")
			}
		}
		if change.EventType == "mas.created" && change.MASID == "mas-2" {
			foundCreate = true
			if len(change.AssociatedCEIDs) != 1 || change.AssociatedCEIDs[0] != "ce-1" {
				t.Error("mas.created has wrong associated CEs")
			}
		}
	}

	if !foundUpdate {
		t.Error("Expected mas.updated event not found")
	}
	if !foundCreate {
		t.Error("Expected mas.created event not found")
	}
}

// TestNotificationMASDeleted tests deletion detection
func TestNotificationMASDeleted(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
							{ID: "ce-2"},
						},
					},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{}, // MAS deleted
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)

	if len(changes) != 1 {
		t.Fatalf("Expected 1 change, got %d", len(changes))
	}

	change := changes[0]
	if change.EventType != "mas.deleted" {
		t.Errorf("Expected mas.deleted, got %s", change.EventType)
	}
	if change.MASID != "mas-1" {
		t.Errorf("Expected mas-1, got %s", change.MASID)
	}
	if len(change.AssociatedCEIDs) != 2 {
		t.Errorf("Expected 2 associated CEs, got %d", len(change.AssociatedCEIDs))
	}
}

// TestNotificationNoChanges tests that no changes are detected when config is identical
func TestNotificationNoChanges(t *testing.T) {
	config := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
				},
			},
		},
	}

	changes := detectMASChanges(config, config)

	if len(changes) != 0 {
		t.Errorf("Expected 0 changes for identical configs, got %d", len(changes))
	}
}

// TestNotificationMultipleMASChanges tests multiple simultaneous changes
func TestNotificationMultipleMASChanges(t *testing.T) {
	oldConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
					{
						ID:            "mas-2",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-2"},
						},
					},
				},
			},
		},
	}

	newConfig := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T11:00:00Z", // Updated
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
						},
					},
					{
						ID:            "mas-3", // Created (mas-2 deleted)
						LastUpdatedOn: "2026-10-12T11:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-3"},
						},
					},
				},
			},
		},
	}

	changes := detectMASChanges(oldConfig, newConfig)

	if len(changes) != 3 {
		t.Fatalf("Expected 3 changes (1 update, 1 create, 1 delete), got %d", len(changes))
	}

	eventCounts := make(map[string]int)
	for _, change := range changes {
		eventCounts[change.EventType]++
	}

	if eventCounts["mas.updated"] != 1 {
		t.Errorf("Expected 1 mas.updated, got %d", eventCounts["mas.updated"])
	}
	if eventCounts["mas.created"] != 1 {
		t.Errorf("Expected 1 mas.created, got %d", eventCounts["mas.created"])
	}
	if eventCounts["mas.deleted"] != 1 {
		t.Errorf("Expected 1 mas.deleted, got %d", eventCounts["mas.deleted"])
	}
}

// TestNotificationCEAssociation tests CE-MAS association tracking
func TestNotificationCEAssociation(t *testing.T) {
	config := &CfnConfigPayload{
		Workspaces: []WorkspaceCfg{
			{
				MASList: []MASCfg{
					{
						ID:            "mas-1",
						LastUpdatedOn: "2026-10-12T10:00:00Z",
						CognitionEngines: []MASEngineCfg{
							{ID: "ce-1"},
							{ID: "ce-2"},
							{ID: "ce-3"},
						},
					},
				},
			},
		},
	}

	ceIDs := extractCEIDs(config.Workspaces[0].MASList[0])

	if len(ceIDs) != 3 {
		t.Fatalf("Expected 3 CE IDs, got %d", len(ceIDs))
	}

	expectedCEs := map[string]bool{"ce-1": true, "ce-2": true, "ce-3": true}
	for _, id := range ceIDs {
		if !expectedCEs[id] {
			t.Errorf("Unexpected CE ID: %s", id)
		}
	}
}
