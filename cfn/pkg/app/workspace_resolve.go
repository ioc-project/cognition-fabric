// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/ioc-project/cognition-fabric/cfn/pkg/client/mgmt"
)

var (
	errSnapshotUnavailable  = errors.New("config snapshot unavailable")
	errMASNotAssigned       = errors.New("MAS not assigned to this CFN")
	errMASNotFound          = errors.New("MAS not found")
	errMgmtURLNotConfigured = errors.New("management plane URL not configured")
	errCENotInSnapshot      = errors.New("CE not yet in CFN config")
)

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

func associatedMASIds(ceID string) ([]string, error) {
	cfg := currentConfig()
	if cfg == nil {
		return nil, errSnapshotUnavailable
	}
	found := false
	for _, ce := range cfg.CognitionEngines {
		if ce.ID == ceID {
			found = true
			break
		}
	}
	if !found {
		return nil, errCENotInSnapshot
	}
	seen := make(map[string]struct{})
	ids := make([]string, 0)
	for _, ws := range cfg.Workspaces {
		for _, mas := range ws.MASList {
			for _, ce := range mas.CognitionEngines {
				if ce.ID != ceID {
					continue
				}
				if _, ok := seen[mas.ID]; ok {
					break
				}
				seen[mas.ID] = struct{}{}
				ids = append(ids, mas.ID)
				break
			}
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func resolveMASWorkspace(masID string) (string, error) {
	ws, found, loaded := lookupMASWorkspace(masID)
	if found {
		return ws, nil
	}
	if !loaded {
		return "", errSnapshotUnavailable
	}
	return "", errMASNotAssigned
}

func fetchMASForRequest(ctx context.Context, masID string) (*mgmt.MASResponse, string, error) {
	if MgmtURL == "" {
		return nil, "", errMgmtURLNotConfigured
	}

	ws, err := resolveMASWorkspace(masID)
	if err != nil {
		return nil, "", err
	}

	client := mgmt.New(MgmtURL, 30*time.Second)
	mas, err := client.GetMAS(ctx, ws, masID)
	if err != nil {
		if errors.Is(err, mgmt.ErrNotFound) {
			return nil, "", errMASNotFound
		}
		return nil, "", err
	}
	return mas, ws, nil
}
