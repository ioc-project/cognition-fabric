// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package oxp is the client of OXP: the Cognition Store and session spans.
package oxp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/httpjson"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Client reads session span context.
type Client struct {
	Base string
	HTTP *http.Client
}

// Store is the OXP Cognition Store: findings of a MAS, read before and written after each decision.
type Store struct {
	Base   string
	Client *http.Client
}

func (s *Store) Read(ctx context.Context, r *cev1.EvaluateRequest) (err error) {
	started := time.Now()
	logger := logging.FromContext(ctx)
	logger.InfoContext(ctx, "Reading prior findings from Cognition Store", "event", "store.read.start", "stage", "STORE", "method", "GET", "endpoint", "/api/v1/cognition-store/findings")
	defer func() {
		if err != nil {
			logger.ErrorContext(ctx, "Cognition Store read failed", "event", "store.read.failed", "stage", "STORE", "elapsed_ms", time.Since(started).Milliseconds())
		}
	}()
	q := url.Values{"mas_id": {r.MasId}, "trace_id": {r.TraceId}, "limit": {"100"}}
	if r.SessionId != "" {
		q.Set("session_id", r.SessionId)
	}
	var out struct {
		Findings []json.RawMessage `json:"findings"`
	}
	if err := httpjson.Exchange(ctx, s.Client, "GET", s.Base+"/api/v1/cognition-store/findings?"+q.Encode(), nil, &out); err != nil {
		return err
	}
	if out.Findings == nil {
		return fmt.Errorf("findings list missing")
	}
	logger.InfoContext(ctx, "Prior findings fetched; their content is not used in this demo decision", "event", "store.read.complete", "stage", "STORE", "findings_count", len(out.Findings), "history_used_for_decision", false, "elapsed_ms", time.Since(started).Milliseconds())
	return nil
}
func (s *Store) Write(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, ruleID string) (err error) {
	started := time.Now()
	logger := logging.FromContext(ctx)
	logger.InfoContext(ctx, "Persisting final finding to Cognition Store", "event", "store.write.start", "stage", "STORE", "method", "POST", "endpoint", "/api/v1/cognition-store/findings", "outcome", logging.Outcome(out), "check_id", ruleID)
	defer func() {
		if err != nil {
			logger.ErrorContext(ctx, "Final finding was not acknowledged by Cognition Store", "event", "store.write.failed", "stage", "STORE", "elapsed_ms", time.Since(started).Milliseconds())
		}
	}()
	var id [16]byte
	if _, err := rand.Read(id[:]); err != nil {
		return err
	}
	outcome := "ALLOW"
	if out.Outcome == cev1.Decision_DECISION_DENY {
		outcome = "DENY"
	}
	body := map[string]any{"finding_id": hex.EncodeToString(id[:]), "mas_id": r.MasId, "trace_id": r.TraceId, "session_id": r.SessionId, "outcome": outcome, "reason": ruleID + ": " + out.Reason, "source_agent_id": r.SourceAgentId, "destination_agent_id": r.DestinationAgentId, "action_class": r.ActionClass.String(), "direction": r.Direction.String(), "timestamp": out.Timestamp}
	var result struct {
		Success bool `json:"success"`
	}
	if err := httpjson.Exchange(ctx, s.Client, "POST", s.Base+"/api/v1/cognition-store/findings", body, &result); err != nil {
		return err
	}
	if !result.Success {
		return fmt.Errorf("store did not acknowledge finding")
	}
	logger.InfoContext(ctx, "Final finding acknowledged by Cognition Store", "event", "store.write.complete", "stage", "STORE", "outcome", logging.Outcome(out), "finding_id", hex.EncodeToString(id[:]), "elapsed_ms", time.Since(started).Milliseconds())
	return nil
}
