// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
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

func TestResolveMASWorkspace_RefreshOnMissFindsMAS(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1"}},
	})
	setLastRefreshOK(false)

	var refreshes atomic.Int32
	ws, err := resolveMASWorkspace(t.Context(), "mas-1", func(context.Context) error {
		refreshes.Add(1)
		applyParsedConfig(&CfnConfigPayload{
			ConfigVersion: 2,
			Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
		})
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ws != "ws-1" {
		t.Fatalf("workspace = %q, want ws-1", ws)
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh calls = %d, want 1", refreshes.Load())
	}
}

func TestResolveMASWorkspace_KnownMissSkipsRefresh(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1", MASList: []MASCfg{{ID: "mas-1"}}}},
	})
	setLastRefreshOK(true)

	_, err := resolveMASWorkspace(t.Context(), "missing", func(context.Context) error {
		t.Fatal("refresh must not run on a known miss")
		return nil
	})
	if err != errMASNotAssigned {
		t.Fatalf("got %v, want errMASNotAssigned", err)
	}
}

func TestResolveMASWorkspace_RefreshOnMissStillMissing(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(&CfnConfigPayload{
		ConfigVersion: 1,
		Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1"}},
	})
	setLastRefreshOK(false)

	var refreshes atomic.Int32
	_, err := resolveMASWorkspace(t.Context(), "mas-1", func(context.Context) error {
		refreshes.Add(1)
		applyParsedConfig(&CfnConfigPayload{
			ConfigVersion: 2,
			Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1"}},
		})
		return nil
	})
	if err != errMASNotAssigned {
		t.Fatalf("got %v, want errMASNotAssigned", err)
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh calls = %d, want 1", refreshes.Load())
	}
}

func TestResolveMASWorkspace_UnavailableAfterFailedRefresh(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	applyParsedConfig(nil)
	setLastRefreshOK(false)

	var refreshes atomic.Int32
	_, err := resolveMASWorkspace(t.Context(), "mas-1", func(context.Context) error {
		refreshes.Add(1)
		return errors.New("refresh failed")
	})
	if err != errSnapshotUnavailable {
		t.Fatalf("got %v, want errSnapshotUnavailable", err)
	}
	if refreshes.Load() != 1 {
		t.Fatalf("refresh calls = %d, want 1", refreshes.Load())
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

func restoreCoalescedRefreshState() func() {
	refreshMu.Lock()
	oldInFlight := refreshInFlight
	oldDone := refreshDone
	oldOK := lastRefreshOK
	oldErr := lastRefreshErr
	refreshInFlight = false
	refreshDone = nil
	lastRefreshOK = false
	lastRefreshErr = nil
	refreshMu.Unlock()

	return func() {
		refreshMu.Lock()
		refreshInFlight = oldInFlight
		refreshDone = oldDone
		lastRefreshOK = oldOK
		lastRefreshErr = oldErr
		refreshMu.Unlock()
	}
}

func TestWaitCoalescedRefresh_WaitersSharePullError(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		restore := restoreCoalescedRefreshState()
		defer restore()

		setLastRefreshOK(true)

		want := errors.New("pull failed")
		started := make(chan struct{})
		release := make(chan struct{})

		var pulls atomic.Int32
		pull := func() error {
			if pulls.Add(1) == 1 {
				close(started)
			}
			<-release
			return want
		}

		errs := make(chan error, 2)
		for i := 0; i < 2; i++ {
			go func() {
				errs <- waitCoalescedRefresh(context.Background(), pull)
			}()
		}

		<-started
		synctest.Wait()
		close(release)
		synctest.Wait()

		for i := 0; i < 2; i++ {
			if err := <-errs; !errors.Is(err, want) {
				t.Fatalf("waiter = %v, want %v", err, want)
			}
		}
		if pulls.Load() != 1 {
			t.Fatalf("pulls = %d, want 1", pulls.Load())
		}
		if snapshotRefreshSucceeded() {
			t.Fatal("expected lastRefreshOK to be false after a failed pull")
		}
	})
}

func TestWaitCoalescedRefresh_TimeoutDoesNotCancelPull(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		restore := restoreCoalescedRefreshState()
		defer restore()

		started := make(chan struct{})
		release := make(chan struct{})

		var pulls atomic.Int32
		pull := func() error {
			if pulls.Add(1) == 1 {
				close(started)
			}
			<-release
			return nil
		}

		shortCtx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
		defer cancel()

		shortErr := make(chan error, 1)
		longErr := make(chan error, 1)
		go func() {
			shortErr <- waitCoalescedRefresh(shortCtx, pull)
		}()
		go func() {
			longErr <- waitCoalescedRefresh(context.Background(), pull)
		}()

		<-started
		synctest.Wait()
		time.Sleep(40 * time.Millisecond)
		synctest.Wait()

		select {
		case err := <-shortErr:
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("short waiter = %v, want deadline exceeded", err)
			}
		default:
			t.Fatal("short waiter did not return after timeout")
		}

		select {
		case err := <-longErr:
			t.Fatalf("long waiter returned early: %v", err)
		default:
		}

		refreshMu.Lock()
		inFlight := refreshInFlight
		refreshMu.Unlock()
		if !inFlight {
			t.Fatal("expected pull still in flight after waiter timeout")
		}

		close(release)
		if err := <-longErr; err != nil {
			t.Fatalf("long waiter = %v, want nil", err)
		}
		if pulls.Load() != 1 {
			t.Fatalf("pulls = %d, want 1", pulls.Load())
		}
	})
}

func TestWaitCoalescedRefresh_StartsNewPullAfterComplete(t *testing.T) {
	restore := restoreCoalescedRefreshState()
	defer restore()

	var pulls atomic.Int32
	pull := func() error {
		pulls.Add(1)
		return nil
	}

	if err := waitCoalescedRefresh(context.Background(), pull); err != nil {
		t.Fatalf("first refresh: %v", err)
	}
	refreshMu.Lock()
	firstDone := refreshDone
	refreshMu.Unlock()

	if err := waitCoalescedRefresh(context.Background(), pull); err != nil {
		t.Fatalf("second refresh: %v", err)
	}
	refreshMu.Lock()
	secondDone := refreshDone
	refreshMu.Unlock()

	if pulls.Load() != 2 {
		t.Fatalf("pulls = %d, want 2", pulls.Load())
	}
	if firstDone == nil || secondDone == nil || firstDone == secondDone {
		t.Fatal("expected a new done channel for the second pull")
	}
}

func TestWaitCoalescedRefresh_NilWaitCtx(t *testing.T) {
	restore := restoreCoalescedRefreshState()
	defer restore()

	var pulled atomic.Bool
	err := waitCoalescedRefresh(nil, func() error {
		pulled.Store(true)
		return nil
	})
	if err != nil {
		t.Fatalf("nil waitCtx = %v", err)
	}
	if !pulled.Load() {
		t.Fatal("expected pull to run")
	}
}

func TestFetchMAS_RefreshDropsMASAfter404(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	var masGets []string
	var cfnGets int
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/cognition-fabric-nodes/cfn-1":
			cfnGets++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"config": CfnConfigPayload{
					ConfigVersion: 2,
					Workspaces:    []WorkspaceCfg{{WorkspaceID: "ws-1"}},
				},
			})
		case "/api/workspaces/ws-1/multi-agentic-systems/mas-1":
			masGets = append(masGets, r.URL.Path)
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
		t.Fatalf("got %v, want errMASNotFound", err)
	}
	if cfnGets != 1 {
		t.Fatalf("config refresh calls = %d, want 1", cfnGets)
	}
	if len(masGets) != 1 {
		t.Fatalf("GetMAS calls = %v, want exactly 1 (no second GetMAS after MAS dropped)", masGets)
	}
}

func TestFetchMAS_GetMASNon404IsNotRetried(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()

	// Use 400 rather than 5xx so the HTTP client does not retry before fetchMASForRequest sees the error.
	var masGets, cfnGets int
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/cognition-fabric-nodes/cfn-1":
			cfnGets++
			w.WriteHeader(http.StatusOK)
		case "/api/workspaces/ws-1/multi-agentic-systems/mas-1":
			masGets++
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"boom"}`))
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
	if err == nil {
		t.Fatal("expected GetMAS 400 to fail")
	}
	if errors.Is(err, errMASNotFound) || errors.Is(err, errSnapshotUnavailable) {
		t.Fatalf("got sentinel %v, want raw GetMAS 400", err)
	}
	if !strings.Contains(err.Error(), "status=400") {
		t.Fatalf("error = %v, want status=400", err)
	}
	if masGets != 1 {
		t.Fatalf("GetMAS calls = %d, want 1", masGets)
	}
	if cfnGets != 0 {
		t.Fatalf("config refresh calls = %d, want 0", cfnGets)
	}
}
