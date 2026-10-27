// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

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
	setLastRefreshOK(true)

	ws, found, loaded := lookupMASWorkspace("missing")
	if ws != "" || found || !loaded {
		t.Fatalf("lookup missing = (%q, %v, %v), want empty/not found/loaded", ws, found, loaded)
	}

	_, err := resolveMASWorkspace(t.Context(), "missing", nil)
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
	setLastRefreshOK(true)

	_, found, loaded := lookupMASWorkspace("mas-1")
	if found || loaded {
		t.Fatalf("empty workspaces lookup found=%v loaded=%v", found, loaded)
	}

	_, err := resolveMASWorkspace(t.Context(), "mas-1", nil)
	if err != errSnapshotUnavailable {
		t.Fatalf("resolve empty workspaces = %v, want errSnapshotUnavailable", err)
	}
}

func TestLookupMASWorkspace_NilSnapshot(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(nil)
	setLastRefreshOK(false)

	_, found, loaded := lookupMASWorkspace("mas-1")
	if found || loaded {
		t.Fatalf("nil snapshot lookup found=%v loaded=%v", found, loaded)
	}

	_, err := resolveMASWorkspace(t.Context(), "mas-1", nil)
	if err != errSnapshotUnavailable {
		t.Fatalf("resolve nil snapshot = %v, want errSnapshotUnavailable", err)
	}
}

func TestFetchMAS_RetriesAfterStaleWorkspace404(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	var masGets []string
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/cognition-fabric-nodes/cfn-1":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"config": CfnConfigPayload{
					ConfigVersion: 2,
					Workspaces: []WorkspaceCfg{{
						WorkspaceID: "ws-new",
						MASList:     []MASCfg{{ID: "mas-1", Name: "Moved"}},
					}},
				},
			})
		case "/api/workspaces/ws-old/multi-agentic-systems/mas-1":
			masGets = append(masGets, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		case "/api/workspaces/ws-new/multi-agentic-systems/mas-1":
			masGets = append(masGets, r.URL.Path)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":           "mas-1",
				"workspace_id": "ws-new",
				"name":         "Moved",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	MgmtURL = mock.URL
	CfnID = "cfn-1"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-old", MASList: []MASCfg{{ID: "mas-1"}}}},
	})
	setLastRefreshOK(true)

	mas, ws, err := fetchMASForRequest(context.Background(), "mas-1", (&App{}).RefreshConfig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ws != "ws-new" || mas == nil || mas.WorkspaceID != "ws-new" {
		t.Fatalf("got workspace %q mas=%v, want ws-new", ws, mas)
	}
	if len(masGets) < 2 {
		t.Fatalf("expected stale then live GetMAS, got %v", masGets)
	}
	if masGets[0] != "/api/workspaces/ws-old/multi-agentic-systems/mas-1" {
		t.Errorf("first GetMAS path = %s, want ws-old", masGets[0])
	}
	if masGets[len(masGets)-1] != "/api/workspaces/ws-new/multi-agentic-systems/mas-1" {
		t.Errorf("last GetMAS path = %s, want ws-new", masGets[len(masGets)-1])
	}
}

func TestFetchMAS_PersistentGetMAS404IsNotCached(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	var masGets int
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/cognition-fabric-nodes/cfn-1":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"config": CfnConfigPayload{
					ConfigVersion: 1,
					Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
				},
			})
		case "/api/workspaces/ws-1/multi-agentic-systems/mas-1":
			masGets++
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	MgmtURL = mock.URL
	CfnID = "cfn-1"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
	})
	setLastRefreshOK(true)

	_, _, err := fetchMASForRequest(context.Background(), "mas-1", (&App{}).RefreshConfig)
	if err != errMASNotFound {
		t.Fatalf("first call = %v, want errMASNotFound", err)
	}
	_, _, err = fetchMASForRequest(context.Background(), "mas-1", (&App{}).RefreshConfig)
	if err != errMASNotFound {
		t.Fatalf("second call = %v, want errMASNotFound", err)
	}
	if masGets < 4 {
		t.Fatalf("GetMAS calls = %d, want at least 4 (no 404 cache)", masGets)
	}
}

func TestFetchMAS_UnavailableWhileRefreshInFlight(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	oldWait := requestPathRefreshWait
	requestPathRefreshWait = 20 * time.Millisecond
	defer func() { requestPathRefreshWait = oldWait }()

	started := make(chan struct{})
	release := make(chan struct{})
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/cognition-fabric-nodes/cfn-1":
			close(started)
			<-release
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"config": CfnConfigPayload{
					ConfigVersion: 2,
					Workspaces: []WorkspaceCfg{{
						WorkspaceID: "ws-new",
						MASList:     []MASCfg{{ID: "mas-1"}},
					}},
				},
			})
		case "/api/workspaces/ws-old/multi-agentic-systems/mas-1":
			w.WriteHeader(http.StatusNotFound)
		case "/api/workspaces/ws-new/multi-agentic-systems/mas-1":
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id":           "mas-1",
				"workspace_id": "ws-new",
				"name":         "Moved",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer mock.Close()

	MgmtURL = mock.URL
	CfnID = "cfn-1"
	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-old", MASList: []MASCfg{{ID: "mas-1"}}}},
	})
	setLastRefreshOK(true)

	_, _, err := fetchMASForRequest(context.Background(), "mas-1", (&App{}).RefreshConfig)
	if err != errSnapshotUnavailable {
		t.Fatalf("timed-out refresh = %v, want errSnapshotUnavailable", err)
	}

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("refresh pull did not start")
	}
	close(release)
	for i := 0; i < 50; i++ {
		refreshMu.Lock()
		inFlight := refreshInFlight
		refreshMu.Unlock()
		if !inFlight {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	mas, ws, err := fetchMASForRequest(context.Background(), "mas-1", (&App{}).RefreshConfig)
	if err != nil {
		t.Fatalf("after refresh completed: %v", err)
	}
	if ws != "ws-new" || mas == nil {
		t.Fatalf("got workspace %q mas=%v, want ws-new", ws, mas)
	}
}

func TestRefreshConfig_CoalescesWaiters(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	var pulls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/api/cognition-fabric-nodes/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if pulls.Add(1) == 1 {
			close(started)
		}
		<-release
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"config": CfnConfigPayload{ConfigVersion: 3, Workspaces: []WorkspaceCfg{{WorkspaceID: "ws-1"}}},
		})
	}))
	defer mock.Close()

	MgmtURL = mock.URL
	CfnID = "cfn-1"
	a := &App{}

	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- a.RefreshConfig(context.Background())
		}()
	}

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("refresh pull did not start")
	}
	close(release)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("RefreshConfig: %v", err)
		}
	}
	if pulls.Load() != 1 {
		t.Fatalf("pulls = %d, want 1", pulls.Load())
	}
}
