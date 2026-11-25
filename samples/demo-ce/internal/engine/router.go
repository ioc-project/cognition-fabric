// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package engine is the CognitionEngine served to CFN: the identity config of a MAS first, then the content
// of the request, joining exact pre-call events with causal span history in OXP.
package engine

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/engine/identity"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/ids"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/inbox"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/logging"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
)

// Options is what a Router needs besides the config.
type Options struct {
	// MasID resolves the MAS of a single (non per-MAS) config; it may fail until the MAS is known.
	MasID func() (string, error)
	// OXPURL is the OXP base URL; empty disables span history and fallback.
	OXPURL string
	// Store is the Cognition Store; nil means findings are neither read nor written.
	Store *oxp.Store
	// Inbox receives the pre-call events; evidence from events needs it.
	Inbox *inbox.Inbox
	// Wait bounds the wait for session context.
	Wait time.Duration
	// Attempts includes the initial context lookup; zero defaults to five.
	Attempts int
	// RetryWait separates failed context lookups; zero defaults to 0.2s.
	RetryWait time.Duration
	// CEType and CEVersion are reported in GetInfo.
	CEType, CEVersion string
}

// Router is the CognitionEngine served to CFN. With a single config it forwards everything to one engine
// (which denies a foreign MAS itself); with per-MAS configs it picks the engine of the request's MAS and
// denies any other MAS without touching its Cognition Store scope.
type Router struct {
	cev1.UnimplementedCognitionEngineServer
	single *contentEngine
	byMAS  map[string]*contentEngine
	order  []string
}

// New builds the router of a decoded config file.
func New(set config.Set, o Options) *Router {
	build := func(p config.Config, mas func() (string, error)) *contentEngine {
		id := &identity.Engine{Config: p, MasID: mas, CEType: o.CEType, CEVersion: o.CEVersion}
		return newContentEngine(id, contentOptions{OXPURL: o.OXPURL, Wait: o.Wait, Attempts: o.Attempts, RetryWait: o.RetryWait, Inbox: o.Inbox, Store: o.Store})
	}
	rt := &Router{}
	if set.Single != nil {
		rt.single = build(*set.Single, o.MasID)
		return rt
	}
	rt.byMAS, rt.order = map[string]*contentEngine{}, set.Order
	for _, id := range set.Order {
		id := id
		rt.byMAS[id] = build(set.ByMAS[id], func() (string, error) { return id, nil })
	}
	return rt
}

func (rt *Router) Evaluate(ctx context.Context, r *cev1.EvaluateRequest) (out *cev1.EvaluateResponse, err error) {
	ctx = logging.WithRequest(ctx, r)
	logger := logging.FromContext(ctx)
	started := time.Now()
	var request any
	if r != nil {
		raw, marshalErr := protojson.MarshalOptions{UseProtoNames: true, EmitUnpopulated: true}.Marshal(r)
		if marshalErr != nil {
			logger.WarnContext(ctx, "CFN request could not be encoded for logging", "event", "evaluation.request_encoding_failed")
		} else {
			request = json.RawMessage(raw)
		}
	}
	logger.InfoContext(ctx, "CFN evaluation request received", "event", "evaluation.start", "stage", "CFN", "request", request)
	defer func() {
		if err != nil {
			logger.ErrorContext(ctx, "Evaluation failed; no decision returned", "event", "evaluation.failed", "stage", "DECISION", "grpc_code", status.Code(err).String(), "elapsed_ms", time.Since(started).Milliseconds())
			return
		}
		level := slog.LevelInfo
		if out.Outcome == cev1.Decision_DECISION_DENY {
			level = slog.LevelWarn
		}
		logger.Log(ctx, level, "Final decision returned to CFN", "event", "evaluation.complete", "stage", "DECISION", "outcome", logging.Outcome(out), "context_sufficiency", out.GetContextSufficiency().String(), "missing_context_cause", out.GetMissingContextCause().String(), "elapsed_ms", time.Since(started).Milliseconds())
		for _, check := range out.ChecksRun {
			logger.InfoContext(ctx, "Evaluation check result", "event", "evaluation.check", "check_id", check.CheckId, "passed", check.Passed)
		}
		if detailErr := publishDetails(out); detailErr != nil {
			out, err = nil, status.Error(codes.Internal, "could not encode demo CE diagnostics")
			logger.ErrorContext(ctx, "Demo CE details encoding failed", "error", detailErr)
		}
	}()
	if rt.single != nil {
		return rt.single.Evaluate(ctx, r)
	}
	if r == nil || !ids.Valid(r.TraceId, 32) || !ids.Valid(r.SpanId, 16) || r.MasId == "" || r.SourceAgentId == "" || r.DestinationAgentId == "" {
		return nil, status.Error(codes.InvalidArgument, "valid trace/span pair and MAS/source/destination identities required")
	}
	se, ok := rt.byMAS[r.MasId]
	if !ok {
		reason := "MAS is outside this CE's configured scope"
		logger.WarnContext(ctx, "MAS outside configured scope; OXP and Cognition Store skipped", "event", "identity.complete", "stage", "IDENTITY", "outcome", "DENY", "check_id", "MAS_SCOPE")
		return &cev1.EvaluateResponse{TraceId: r.TraceId, Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Outcome: cev1.Decision_DECISION_DENY, DenialReason: cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT.Enum(), Reason: reason,
			ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC.Enum(), ChecksRun: []*cev1.CheckResult{{CheckId: "MAS_SCOPE", Passed: false, Reason: reason}}}, nil
	}
	return se.Evaluate(ctx, r)
}

func (rt *Router) GetInfo(ctx context.Context, r *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	if rt.single != nil {
		return rt.single.GetInfo(ctx, r)
	}
	var info *cev1.GetInfoResponse
	seen := map[string]bool{}
	for _, id := range rt.order {
		one, err := rt.byMAS[id].GetInfo(ctx, r)
		if err != nil {
			return nil, err
		}
		checks := one.EnabledChecks
		if info == nil {
			info = one
			info.EnabledChecks = nil
		}
		for _, c := range checks {
			if !seen[c] {
				seen[c] = true
				info.EnabledChecks = append(info.EnabledChecks, c)
			}
		}
	}
	return info, nil
}
