// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/pkg/config"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Losing request correlation, reporting ALLOW before persistence, or exposing
// OXP payloads must fail this test.
func TestEvaluationLogsExplainStoreAndOXPWithoutPayloads(t *testing.T) {
	for _, failWrite := range []bool{false, true} {
		t.Run(map[bool]string{false: "allow", true: "store unavailable"}[failWrite], func(t *testing.T) {
			var logs bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
			defer slog.SetDefault(previous)
			api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.URL.Path == "/api/v1/cognition-store/findings" && r.Method == "GET":
					w.Write([]byte(`{"findings":[{"reason":"PRIVATE_FINDING"}]}`))
				case r.URL.Path == "/api/v1/cognition-store/findings":
					if failWrite {
						w.WriteHeader(503)
						w.Write([]byte("PRIVATE_RESPONSE"))
						return
					}
					w.Write([]byte(`{"success":true}`))
				case strings.HasSuffix(r.URL.Path, "/spans"):
					json.NewEncoder(w).Encode(map[string]any{"spans": []any{evidenceSpan(span, "", "llm", map[string]string{"gen_ai.input.messages": `[{"role":"user","parts":[{"type":"text","content":"PRIVATE_PROMPT"}]}]`})}})
				default:
					w.Write([]byte(`{"events":[]}`))
				}
			}))
			defer api.Close()
			p := config.Config{Rules: []config.Rule{{ID: "ROUTE", Effect: "ALLOW", Reason: "approved", Sources: []string{"moderator"}}}, ContentRules: []config.ContentRule{{ID: "CONTENT", Reason: "demo check", Pattern: "blocked", Evidence: config.EvidenceLLMInput, Destinations: []string{"schedule"}}}}
			engine := New(config.Set{Single: &p}, Options{MasID: func() (string, error) { return "mas", nil }, Store: &oxp.Store{Base: api.URL, Client: api.Client()}, OXPURL: api.URL, Wait: time.Second})
			req := storeTestRequest()
			req.SessionId = sessionID
			req.Extra = map[string]string{"demo.note": "CFN_REQUEST_BODY"}
			req.OriginalIntent = "complete request intent"
			req.ToolCall = &cev1.ToolCallDetails{ToolName: "lookup", ArgsClassification: map[string]string{"query": "demo"}}
			out, err := engine.Evaluate(context.Background(), req)
			if failWrite {
				if status.Code(err) != codes.Unavailable {
					t.Fatalf("error: %v", err)
				}
			} else if err != nil || out.Outcome != cev1.Decision_DECISION_ALLOW {
				t.Fatalf("response: %v %v", out, err)
			}
			var events []string
			dec := json.NewDecoder(strings.NewReader(logs.String()))
			for dec.More() {
				var row map[string]any
				if err := dec.Decode(&row); err != nil {
					t.Fatal(err)
				}
				if row["trace_id"] != req.TraceId || row["span_id"] != req.SpanId {
					t.Fatalf("uncorrelated log: %v", row)
				}
				event, _ := row["event"].(string)
				if event == "evaluation.start" {
					body, ok := row["request"].(map[string]any)
					if !ok || body["original_intent"] != "complete request intent" || body["tool_call"].(map[string]any)["tool_name"] != "lookup" || body["session_id"] != sessionID || body["extra"].(map[string]any)["demo.note"] != "CFN_REQUEST_BODY" {
						t.Fatalf("CFN request body missing: %v", row)
					}
				}
				events = append(events, event)
				if event == "store.read.complete" && row["findings_count"] != float64(1) {
					t.Fatalf("missing findings count: %v", row)
				}
				if event == "evaluation.complete" && failWrite {
					t.Fatal("successful decision logged after failed persistence")
				}
			}
			want := []string{"evaluation.start", "identity.complete", "store.read.start", "store.read.complete", "oxp.realtime.start", "oxp.realtime.complete", "oxp.context.start", "oxp.context.complete", "evidence.selected", "content.complete", "store.write.start"}
			if failWrite {
				want = append(want, "store.write.failed", "evaluation.failed")
			} else {
				want = append(want, "store.write.complete", "evaluation.complete")
			}
			pos := 0
			for _, event := range events {
				if pos < len(want) && event == want[pos] {
					pos++
				}
			}
			if pos != len(want) {
				t.Fatalf("missing ordered demo flow %v; got %v\n%s", want[pos:], events, logs.String())
			}
			for _, secret := range []string{"PRIVATE_FINDING", "PRIVATE_PROMPT", "PRIVATE_RESPONSE"} {
				if strings.Contains(logs.String(), secret) {
					t.Fatalf("payload leaked: %s", secret)
				}
			}
		})
	}
}
