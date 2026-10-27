// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/mgmt"
)

var requestPathRefreshWait = 2 * time.Second

var (
	errSnapshotUnavailable  = errors.New("config snapshot unavailable")
	errMASNotAssigned       = errors.New("MAS not assigned to this CFN")
	errMASNotFound          = errors.New("MAS not found")
	errMgmtURLNotConfigured = errors.New("management plane URL not configured")
)

var (
	refreshMu       sync.Mutex
	refreshInFlight bool
	refreshDone     chan struct{}
	lastRefreshOK   bool
	lastRefreshErr  error
)

func setLastRefreshOK(ok bool) {
	refreshMu.Lock()
	lastRefreshOK = ok
	if ok {
		lastRefreshErr = nil
	}
	refreshMu.Unlock()
}

func snapshotRefreshSucceeded() bool {
	refreshMu.Lock()
	defer refreshMu.Unlock()
	return lastRefreshOK
}

func configVersion(cfg *CfnConfigPayload) int64 {
	if cfg == nil {
		return 0
	}
	return cfg.ConfigVersion
}

func assignedWorkspaceIDs(cfg *CfnConfigPayload) []string {
	if cfg == nil {
		return nil
	}
	ids := make([]string, 0, len(cfg.Workspaces))
	seen := make(map[string]struct{}, len(cfg.Workspaces))
	for _, ws := range cfg.Workspaces {
		if ws.WorkspaceID == "" {
			continue
		}
		if _, ok := seen[ws.WorkspaceID]; ok {
			continue
		}
		seen[ws.WorkspaceID] = struct{}{}
		ids = append(ids, ws.WorkspaceID)
	}
	return ids
}

// currentConfig returns the current config snapshot. Callers must treat it as
// read-only; writers replace the snapshot with applyParsedConfig.
func currentConfig() *CfnConfigPayload {
	cfnConfigMutex.RLock()
	defer cfnConfigMutex.RUnlock()
	return ParsedConfig
}

func applyParsedConfig(parsed *CfnConfigPayload) *CfnConfigPayload {
	cfnConfigMutex.Lock()
	old := ParsedConfig
	ParsedConfig = parsed
	if parsed != nil {
		ConfigVersion = parsed.ConfigVersion
	} else {
		ConfigVersion = 0
	}
	cfnConfigMutex.Unlock()
	return old
}

func lookupMASWorkspace(masID string) (workspaceID string, found bool, snapshotLoaded bool) {
	cfg := currentConfig()
	if cfg == nil || len(assignedWorkspaceIDs(cfg)) == 0 {
		return "", false, false
	}

	var first string
	for _, ws := range cfg.Workspaces {
		if ws.WorkspaceID == "" {
			continue
		}
		for _, mas := range ws.MASList {
			if mas.ID != masID {
				continue
			}
			if first == "" {
				first = ws.WorkspaceID
				continue
			}
			if first != ws.WorkspaceID {
				getLogger().Warnf("duplicate mas_id in snapshot: mas_id=%s first_workspace=%s other_workspace=%s", masID, first, ws.WorkspaceID)
			}
		}
	}
	if first == "" {
		return "", false, true
	}
	return first, true, true
}

func waitCoalescedRefresh(waitCtx context.Context, pull func() error) error {
	if waitCtx == nil {
		waitCtx = context.Background()
	}

	refreshMu.Lock()
	if refreshInFlight {
		done := refreshDone
		refreshMu.Unlock()
		return waitForRefresh(waitCtx, done)
	}
	refreshInFlight = true
	done := make(chan struct{})
	refreshDone = done
	refreshMu.Unlock()

	go func() {
		err := pull()
		refreshMu.Lock()
		lastRefreshErr = err
		lastRefreshOK = err == nil
		refreshInFlight = false
		close(done)
		refreshMu.Unlock()
	}()

	return waitForRefresh(waitCtx, done)
}

func waitForRefresh(waitCtx context.Context, done <-chan struct{}) error {
	select {
	case <-done:
		refreshMu.Lock()
		err := lastRefreshErr
		refreshMu.Unlock()
		return err
	case <-waitCtx.Done():
		return waitCtx.Err()
	}
}

func refreshOnRequestPath(ctx context.Context, refresh func(context.Context) error) error {
	if refresh == nil {
		return nil
	}
	waitCtx, cancel := context.WithTimeout(ctx, requestPathRefreshWait)
	defer cancel()
	err := refresh(waitCtx)
	if err != nil {
		getLogger().Warnf("request-path config refresh failed: %v", err)
	}
	return err
}

func resolveMASWorkspace(ctx context.Context, masID string, refresh func(context.Context) error) (string, error) {
	ws, found, loaded := lookupMASWorkspace(masID)
	if found {
		return ws, nil
	}
	if loaded && snapshotRefreshSucceeded() {
		return "", errMASNotAssigned
	}

	_ = refreshOnRequestPath(ctx, refresh)

	ws, found, loaded = lookupMASWorkspace(masID)
	if found {
		return ws, nil
	}
	if !loaded {
		return "", errSnapshotUnavailable
	}
	return "", errMASNotAssigned
}

func fetchMASForRequest(ctx context.Context, masID string, refresh func(context.Context) error) (*mgmt.MASResponse, string, error) {
	if MgmtURL == "" {
		return nil, "", errMgmtURLNotConfigured
	}

	ws, err := resolveMASWorkspace(ctx, masID, refresh)
	if err != nil {
		return nil, "", err
	}

	client := mgmt.New(MgmtURL, 30*time.Second)
	mas, err := client.GetMAS(ctx, ws, masID)
	if err == nil {
		return mas, ws, nil
	}
	if !errors.Is(err, mgmt.ErrNotFound) {
		return nil, "", err
	}

	refreshErr := refreshOnRequestPath(ctx, refresh)

	ws, err = resolveMASWorkspace(ctx, masID, nil)
	if err != nil {
		if errors.Is(err, errMASNotAssigned) {
			return nil, "", notFoundAfterRefresh(refreshErr)
		}
		return nil, "", err
	}

	mas, err = client.GetMAS(ctx, ws, masID)
	if err != nil {
		if errors.Is(err, mgmt.ErrNotFound) {
			return nil, "", notFoundAfterRefresh(refreshErr)
		}
		return nil, "", err
	}
	return mas, ws, nil
}

func notFoundAfterRefresh(refreshErr error) error {
	if refreshErr != nil {
		return errSnapshotUnavailable
	}
	return errMASNotFound
}
