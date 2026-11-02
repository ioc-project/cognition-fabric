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
