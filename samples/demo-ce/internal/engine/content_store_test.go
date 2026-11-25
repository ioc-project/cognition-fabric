// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/inbox"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
)

// Writing the identity ALLOW before content evaluation must fail this test.
func TestStorePersistsOnlyTheFinalContentDecision(t *testing.T) {
	for _, tc := range []struct {
		name, input, storedOutcome, reason string
		missing                            bool
		decision                           cev1.Decision
	}{
		{"content allowed", "ordinary trip", "ALLOW", "approved", false, cev1.Decision_DECISION_ALLOW},
		{"content denied", "secret-value", "DENY", "NO_SECRET", false, cev1.Decision_DECISION_DENY},
		{"context missing", "", "DENY", "required input/context", true, cev1.Decision_DECISION_DENY},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var findings []map[string]any
			var mu sync.Mutex
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					_ = json.NewEncoder(w).Encode(map[string]any{"findings": []any{}})
					return
				}
				var finding map[string]any
				if err := json.NewDecoder(r.Body).Decode(&finding); err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				mu.Lock()
				findings = append(findings, finding)
				mu.Unlock()
				_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
			}))
			defer api.Close()
			in := inbox.New("noa-trip-planner-mas", 16)
			event := llmFixture(t, "a2a_tool_started.json")
			event["data"].(map[string]any)["input"] = map[string]any{"text": tc.input}
			if !tc.missing {
				pushEvent(t, in, event)
			}
			p := config.Config{Rules: []config.Rule{{ID: "APPROVED", Effect: "ALLOW", Reason: "approved", Sources: []string{"caller"}, Destinations: []string{"target"}}}, ContentRules: []config.ContentRule{{ID: "NO_SECRET", Reason: "no secrets", Pattern: "secret-value", Evidence: config.EvidenceA2AMessageInput, Destinations: []string{"target"}}}}
			engine := New(config.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, Inbox: in, Wait: time.Second, Store: &oxp.Store{Base: api.URL, Client: api.Client()}})
			out, err := engine.Evaluate(context.Background(), eventRequest(event))
			if err != nil || out.Outcome != tc.decision {
				t.Fatalf("final response: %+v %v", out, err)
			}
			mu.Lock()
			defer mu.Unlock()
			if len(findings) != 1 {
				t.Fatalf("expected one final finding, got %d", len(findings))
			}
			finding := findings[0]
			if finding["outcome"] != tc.storedOutcome || !strings.Contains(finding["reason"].(string), tc.reason) {
				t.Fatalf("stored decision differs from final response: finding=%+v response=%+v", finding, out)
			}
			if tc.decision == cev1.Decision_DECISION_DENY && strings.HasPrefix(finding["reason"].(string), "APPROVED:") {
				t.Fatalf("denial was attributed to the identity allow rule: %+v", finding)
			}
		})
	}
}
