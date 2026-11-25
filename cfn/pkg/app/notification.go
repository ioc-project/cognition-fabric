// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"time"

	httpclient "github.com/ioc-project/cognition-fabric/cfn/pkg/client/http"
)

// MASChange represents a detected MAS lifecycle change.
type MASChange struct {
	EventType       string // "mas.created", "mas.updated", "mas.deleted"
	MASID           string
	AssociatedCEIDs []string // CE IDs associated with this MAS
}

// detectMASChanges compares old and new config to detect MAS changes.
// Changes are detected by comparing LastUpdatedOn timestamps - if the timestamp
// differs, the MAS is considered updated. New MAS IDs are treated as created,
// and missing MAS IDs as deleted.
func detectMASChanges(oldConfig, newConfig *CfnConfigPayload) []MASChange {
	if oldConfig == nil || newConfig == nil {
		return nil
	}

	var changes []MASChange

	// Build maps for efficient lookup
	oldMAS := make(map[string]MASCfg)
	newMAS := make(map[string]MASCfg)

	for _, ws := range oldConfig.Workspaces {
		for _, mas := range ws.MASList {
			oldMAS[mas.ID] = mas
		}
	}

	for _, ws := range newConfig.Workspaces {
		for _, mas := range ws.MASList {
			newMAS[mas.ID] = mas
		}
	}

	// Detect created and updated MAS
	for id, newM := range newMAS {
		ceIDs := extractCEIDs(newM)
		if oldM, exists := oldMAS[id]; !exists {
			// New MAS created
			changes = append(changes, MASChange{
				EventType:       "mas.created",
				MASID:           id,
				AssociatedCEIDs: ceIDs,
			})
		} else if !sameMASUpdateTime(oldM.LastUpdatedOn, newM.LastUpdatedOn) {
			// MAS updated (timestamp changed)
			changes = append(changes, MASChange{
				EventType:       "mas.updated",
				MASID:           id,
				AssociatedCEIDs: ceIDs,
			})
		}
	}

	// Detect deleted MAS
	for id, oldM := range oldMAS {
		if _, exists := newMAS[id]; !exists {
			ceIDs := extractCEIDs(oldM)
			changes = append(changes, MASChange{
				EventType:       "mas.deleted",
				MASID:           id,
				AssociatedCEIDs: ceIDs,
			})
		}
	}

	return changes
}

// sameMASUpdateTime ignores representational differences for explicit instants.
// Legacy naive or malformed values retain string comparison; CFN never guesses
// a source timezone. Restarting CFN establishes the post-migration baseline.
func sameMASUpdateTime(before, after string) bool {
	if before == after {
		return true
	}
	oldTime, oldErr := time.Parse(time.RFC3339Nano, before)
	newTime, newErr := time.Parse(time.RFC3339Nano, after)
	return oldErr == nil && newErr == nil && oldTime.Equal(newTime)
}

// extractCEIDs extracts CE IDs from a MAS configuration.
func extractCEIDs(mas MASCfg) []string {
	var ceIDs []string
	for _, ce := range mas.CognitionEngines {
		ceIDs = append(ceIDs, ce.ID)
	}
	return ceIDs
}

// dispatchNotifications sends notifications to associated CEs with notification endpoints.
func (a *App) dispatchNotifications(changes []MASChange) {
	if len(changes) == 0 {
		return
	}

	log := getLogger()

	config := currentConfig()

	if config == nil {
		log.Warnf("cannot dispatch notifications: config not available")
		return
	}

	// Build map of CE ID -> EngineCfg for quick lookup
	ceMap := make(map[string]EngineCfg)
	for _, ce := range config.CognitionEngines {
		if ce.NotificationURL != "" && ce.NotificationEndpoint != "" {
			ceMap[ce.ID] = ce
		}
	}

	if len(ceMap) == 0 {
		log.Debugf("no CEs have notification endpoints configured, skipping dispatch")
		return
	}

	// Send notifications only to associated CEs
	totalDispatched := 0
	for _, change := range changes {
		for _, ceID := range change.AssociatedCEIDs {
			if ce, exists := ceMap[ceID]; exists {
				go a.sendNotification(ce, change)
				totalDispatched++
			}
		}
	}

	log.Infof("dispatched %d MAS changes to %d associated CEs", len(changes), totalDispatched)
}

// sendNotification sends a single notification to a CE.
func (a *App) sendNotification(ce EngineCfg, change MASChange) {
	log := getLogger()

	notificationURL := ce.NotificationURL + ce.NotificationEndpoint
	payload := map[string]string{
		"event_type": change.EventType,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"mas_id":     change.MASID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Errorf("failed to marshal notification payload: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client := httpclient.New(10 * time.Second)
	headers := map[string]string{
		"Content-Type": "application/json",
	}

	resp, err := client.Post(ctx, notificationURL, body, headers)
	if err != nil {
		log.Errorf("failed to send notification to CE %s (%s): %v", ce.ID, notificationURL, err)
		return
	}
	defer resp.Body.Close()

	// Retry once on 5xx errors after brief delay
	if resp.StatusCode >= 500 {
		log.Warnf("notification to CE %s returned %d, retrying once", ce.ID, resp.StatusCode)
		time.Sleep(2 * time.Second)

		ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel2()

		resp2, err := client.Post(ctx2, notificationURL, body, headers)
		if err != nil {
			log.Errorf("retry failed to send notification to CE %s: %v", ce.ID, err)
			return
		}
		defer resp2.Body.Close()
		resp = resp2
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Infof("notification sent successfully to CE %s: event=%s mas_id=%s", ce.ID, change.EventType, change.MASID)
	} else {
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		log.Errorf("notification failed for CE %s: status=%d response=%s", ce.ID, resp.StatusCode, buf.String())
	}
}
