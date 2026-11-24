// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"context"
	"encoding/json"
	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func storeTestRequest() *cev1.EvaluateRequest {
	return &cev1.EvaluateRequest{MasId: "mas", SourceAgentId: "moderator", DestinationAgentId: "schedule", TraceId: trace, SpanId: span}
}
func storeTestEngine(p config.Config, store *oxp.Store) *Router {
	return New(config.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, Store: store})
}

// Store failures must not become successful authorization; scope must reach OXP unchanged.
func TestEvaluateCognitionStore(t *testing.T) {
	for _, fail := range []bool{false, true} {
		writes := 0
		api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/cognition-store/findings" {
				t.Errorf("path %s", r.URL.Path)
			}
			if r.Method == "GET" {
				if r.URL.Query().Get("mas_id") != "mas" || r.URL.Query().Get("trace_id") != trace || r.URL.Query().Get("session_id") != "" {
					t.Errorf("query %s", r.URL.RawQuery)
				}
				w.Write([]byte(`{"findings":[],"context_complete":true}`))
				return
			}
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["mas_id"] != "mas" || body["trace_id"] != trace || body["outcome"] != "ALLOW" || body["finding_id"] == "" {
				t.Errorf("finding %+v", body)
			}
			writes++
			if fail {
				w.WriteHeader(503)
				return
			}
			w.Write([]byte(`{"success":true}`))
		}))
		s := storeTestEngine(config.Config{Rules: []config.Rule{{ID: "OK", Effect: "ALLOW", Reason: "approved", Sources: []string{"moderator"}}}}, &oxp.Store{Base: api.URL, Client: api.Client()})
		got, err := s.Evaluate(context.Background(), storeTestRequest())
		if fail && status.Code(err) != codes.Unavailable {
			t.Fatalf("store failure: %v", err)
		}
		if !fail && (err != nil || got.Outcome != cev1.Decision_DECISION_ALLOW) {
			t.Fatalf("%+v %v", got, err)
		}
		if writes != 1 {
			t.Fatalf("writes=%d", writes)
		}
		api.Close()
	}
}

func TestStoreReadFailureAndCancellation(t *testing.T) {
	for _, body := range []string{`{}`, `not-json`} {
		api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "GET" {
				t.Error("write after failed read")
			}
			w.Write([]byte(body))
		}))
		s := storeTestEngine(config.Config{Rules: []config.Rule{{ID: "OK", Effect: "ALLOW", Sources: []string{"moderator"}}}}, &oxp.Store{Base: api.URL, Client: api.Client()})
		if _, err := s.Evaluate(context.Background(), storeTestRequest()); status.Code(err) != codes.Unavailable {
			t.Fatalf("read failure: %v", err)
		}
		api.Close()
	}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer api.Close()
	s := storeTestEngine(config.Config{}, &oxp.Store{Base: api.URL, Client: api.Client()})
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	started := time.Now()
	_, err := s.Evaluate(ctx, storeTestRequest())
	if status.Code(err) != codes.DeadlineExceeded || time.Since(started) > time.Second {
		t.Fatalf("cancellation: %v", err)
	}
}

func TestForeignMASDoesNotAccessStore(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("out-of-scope MAS accessed Cognition Store")
		w.WriteHeader(403)
	}))
	defer api.Close()
	s := storeTestEngine(config.Config{}, &oxp.Store{Base: api.URL, Client: api.Client()})
	r := storeTestRequest()
	r.MasId = "foreign"
	got, err := s.Evaluate(context.Background(), r)
	if err != nil || got.Outcome != cev1.Decision_DECISION_DENY || diagnostics(t, got).ChecksRun[0].CheckId != "MAS_SCOPE" {
		t.Fatalf("scope decision %+v %v", got, err)
	}
}
