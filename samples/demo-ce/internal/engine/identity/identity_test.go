// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package identity

import (
	"context"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
	"net"
	"strings"
	"testing"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const trace = "0123456789abcdef0123456789abcdef"
const span = "0123456789abcdef"

func request() *cev1.EvaluateRequest {
	return &cev1.EvaluateRequest{MasId: "mas", SourceAgentId: "moderator", DestinationAgentId: "schedule", TraceId: trace, SpanId: span}
}

// An always-ALLOW implementation or ignored MAS scope must fail this test.
func TestEvaluateReferenceConfig(t *testing.T) {
	p := config.Config{Rules: []config.Rule{{ID: "DELEGATION", Effect: "ALLOW", Reason: "Approved delegation", Sources: []string{"moderator"}, Destinations: []string{"schedule"}}, {ID: "QUARANTINE", Effect: "DENY", Reason: "Agent suspended", Destinations: []string{"concierge"}}}}
	s := Engine{Config: p, MasID: func() (string, error) { return "mas", nil }}
	for _, tc := range []struct {
		dest, mas string
		outcome   cev1.Decision
		check     string
	}{{"schedule", "mas", cev1.Decision_DECISION_ALLOW, "DELEGATION"}, {"concierge", "mas", cev1.Decision_DECISION_DENY, "QUARANTINE"}, {"external", "mas", cev1.Decision_DECISION_DENY, "DEFAULT_DENY"}, {"schedule", "other", cev1.Decision_DECISION_DENY, "MAS_SCOPE"}} {
		r := request()
		r.DestinationAgentId = tc.dest
		r.MasId = tc.mas
		got, err := s.Evaluate(context.Background(), r)
		if err != nil {
			t.Fatal(err)
		}
		if got.Outcome != tc.outcome || got.ChecksRun[0].CheckId != tc.check || got.TraceId != trace || got.GetContextSufficiency() != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC {
			t.Fatalf("%s/%s: %+v", tc.dest, tc.mas, got)
		}
		if got.Outcome == cev1.Decision_DECISION_DENY && got.GetDenialReason() == cev1.DenialReason_DENIAL_REASON_UNSPECIFIED {
			t.Fatal("deny lacks reason")
		}
	}
	r := request()
	r.SpanId = ""
	if _, err := s.Evaluate(context.Background(), r); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("invalid reference: %v", err)
	}
}

func TestOfficialRPCDenyPrecedence(t *testing.T) {
	s := &Engine{Config: config.Config{Rules: []config.Rule{{ID: "OK", Effect: "ALLOW", Reason: "approved", Sources: []string{"moderator"}}, {ID: "SUSPENDED", Effect: "DENY", Reason: "Temporarily suspended agent", Destinations: []string{"schedule"}}}}, MasID: func() (string, error) { return "mas", nil }}
	listener := bufconn.Listen(1024 * 1024)
	g := grpc.NewServer()
	cev1.RegisterCognitionEngineServer(g, s)
	go g.Serve(listener)
	defer g.Stop()
	conn, err := grpc.NewClient("passthrough:///ce", grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client := cev1.NewCognitionEngineClient(conn)
	got, err := client.Evaluate(context.Background(), request())
	if err != nil || got.Outcome != cev1.Decision_DECISION_DENY || got.ChecksRun[0].CheckId != "SUSPENDED" {
		t.Fatalf("wire: %+v %v", got, err)
	}
	r := request()
	r.SpanId = ""
	if _, err := client.Evaluate(context.Background(), r); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("span reference lost: %v", err)
	}
}

func TestContentRulesDoNotChangeReferenceDecision(t *testing.T) {
	p, err := config.Decode(strings.NewReader(`{"rules":[{"id":"APPROVED","effect":"ALLOW","reason":"approved route","sources":["moderator"],"destinations":["schedule"]}],"content_rules":[{"id":"SENSITIVE","reason":"No secret export","pattern":"password","destinations":["schedule"]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	s := Engine{Config: p, MasID: func() (string, error) { return "mas", nil }}
	got, err := s.Evaluate(context.Background(), request())
	if err != nil || got.Outcome != cev1.Decision_DECISION_ALLOW || got.ChecksRun[0].CheckId != "APPROVED" {
		t.Fatalf("content rule changed the identity decision: %+v %v", got, err)
	}
	info, _ := s.GetInfo(context.Background(), &cev1.GetInfoRequest{})
	for _, id := range info.EnabledChecks {
		if id == "SENSITIVE" {
			t.Fatal("content rule advertised by the identity layer")
		}
	}
}
