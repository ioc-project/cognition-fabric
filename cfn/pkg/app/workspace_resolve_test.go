// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import "testing"

func TestLookupMASWorkspace_FindsAssignedWorkspace(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 2,
		Workspaces: []WorkspaceCfg{
			{WorkspaceID: "ws-default", WorkspaceName: "Default Workspace", MASList: []MASCfg{{ID: "mas-default"}}},
			{WorkspaceID: "ws-other", WorkspaceName: "Other", MASList: []MASCfg{{ID: "mas-other"}}},
		},
	})

	ws, found, loaded := lookupMASWorkspace("mas-other")
	if !loaded {
		t.Fatal("expected snapshot to be loaded")
	}
	if !found || ws != "ws-other" {
		t.Fatalf("lookup mas-other = (%q, %v), want (ws-other, true)", ws, found)
	}
}

func TestLookupMASWorkspace_UnknownMAS(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
	})

	ws, found, loaded := lookupMASWorkspace("missing")
	if ws != "" || found || !loaded {
		t.Fatalf("lookup missing = (%q, %v, %v), want empty/not found/loaded", ws, found, loaded)
	}

	_, err := resolveMASWorkspace("missing")
	if err != errMASNotAssigned {
		t.Fatalf("resolve missing = %v, want errMASNotAssigned", err)
	}
}

func TestLookupMASWorkspace_DuplicateUsesFirst(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces: []WorkspaceCfg{
			{WorkspaceID: "ws-a", MASList: []MASCfg{{ID: "mas-dup"}}},
			{WorkspaceID: "ws-b", MASList: []MASCfg{{ID: "mas-dup"}}},
		},
	})

	ws, found, _ := lookupMASWorkspace("mas-dup")
	if !found || ws != "ws-a" {
		t.Fatalf("duplicate lookup = (%q, %v), want (ws-a, true)", ws, found)
	}
}

func TestLookupMASWorkspace_EmptyWorkspacesUnavailable(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{},
	})

	_, found, loaded := lookupMASWorkspace("mas-1")
	if found || loaded {
		t.Fatalf("empty workspaces lookup found=%v loaded=%v", found, loaded)
	}

	_, err := resolveMASWorkspace("mas-1")
	if err != errSnapshotUnavailable {
		t.Fatalf("resolve empty workspaces = %v, want errSnapshotUnavailable", err)
	}
}

func TestAssociatedMASIds_SnapshotUnavailable(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(nil)

	_, err := associatedMASIds("550e8400-e29b-41d4-a716-446655440000")
	if err != errSnapshotUnavailable {
		t.Fatalf("nil snapshot = %v, want errSnapshotUnavailable", err)
	}
}

func TestAssociatedMASIds_CENotInSnapshot(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    1,
		CognitionEngines: []EngineCfg{{ID: "other-ce"}},
		Workspaces:       []WorkspaceCfg{{WorkspaceID: "ws-1"}},
	})

	_, err := associatedMASIds("550e8400-e29b-41d4-a716-446655440000")
	if err != errCENotInSnapshot {
		t.Fatalf("unknown CE = %v, want errCENotInSnapshot", err)
	}
}

func TestAssociatedMASIds_EmptyAndSorted(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	ceID := "550e8400-e29b-41d4-a716-446655440000"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    1,
		CognitionEngines: []EngineCfg{{ID: ceID}},
		Workspaces: []WorkspaceCfg{
			{WorkspaceID: "ws-b", MASList: []MASCfg{{ID: "mas-z", CognitionEngines: []MASEngineCfg{{ID: ceID}}}}},
			{WorkspaceID: "ws-a", MASList: []MASCfg{{ID: "mas-a", CognitionEngines: []MASEngineCfg{{ID: ceID}}}}},
		},
	})

	got, err := associatedMASIds(ceID)
	if err != nil {
		t.Fatalf("associated: %v", err)
	}
	if len(got) != 2 || got[0] != "mas-a" || got[1] != "mas-z" {
		t.Fatalf("associated=%v want [mas-a mas-z]", got)
	}

	lonely := "550e8400-e29b-41d4-a716-446655440001"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion:    2,
		CognitionEngines: []EngineCfg{{ID: lonely}},
		Workspaces:       []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-a"}}}},
	})
	got, err = associatedMASIds(lonely)
	if err != nil {
		t.Fatalf("empty associated: %v", err)
	}
	if got == nil || len(got) != 0 {
		t.Fatalf("empty associated=%v want empty slice", got)
	}
}

func TestLookupMASWorkspace_NilSnapshot(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(nil)

	_, found, loaded := lookupMASWorkspace("mas-1")
	if found || loaded {
		t.Fatalf("nil snapshot lookup found=%v loaded=%v", found, loaded)
	}

	_, err := resolveMASWorkspace("mas-1")
	if err != errSnapshotUnavailable {
		t.Fatalf("resolve nil snapshot = %v, want errSnapshotUnavailable", err)
	}
}
