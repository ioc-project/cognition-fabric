package engine

import (
	"context"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
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
func TestEvaluateReferencePolicy(t *testing.T) {
	p := policy.Policy{Rules: []policy.Rule{{ID: "DELEGATION", Effect: "ALLOW", Reason: "Approved delegation", Sources: []string{"moderator"}, Destinations: []string{"schedule"}}, {ID: "QUARANTINE", Effect: "DENY", Reason: "Agent suspended", Destinations: []string{"concierge"}}}}
	s := engine{policy: p, masID: func() (string, error) { return "mas", nil }}
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
		if got.Outcome != tc.outcome || got.ChecksRun[0].CheckId != tc.check || got.TraceId != trace || got.ContextSufficiency != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC {
			t.Fatalf("%s/%s: %+v", tc.dest, tc.mas, got)
		}
		if got.Outcome == cev1.Decision_DECISION_DENY && got.DenialReason == cev1.DenialReason_DENIAL_REASON_UNSPECIFIED {
			t.Fatal("deny lacks reason")
		}
	}
	r := request()
	r.SpanId = ""
	if _, err := s.Evaluate(context.Background(), r); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("invalid reference: %v", err)
	}
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
		s := engine{policy: policy.Policy{Rules: []policy.Rule{{ID: "OK", Effect: "ALLOW", Reason: "approved", Sources: []string{"moderator"}}}}, masID: func() (string, error) { return "mas", nil }, store: &oxp.Store{Base: api.URL, Client: api.Client()}}
		got, err := s.Evaluate(context.Background(), request())
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

func TestPolicyRejectsUnsafeConfiguration(t *testing.T) {
	for _, body := range []string{`{"rules":[]}`, `{"rules":[{"id":"X","effect":"ALLOW","reason":"all"}]}`, `{"rules":[{"id":"X","effect":"ALLOW","reason":"ok","sources":["moderator"]}],"content":true}`} {
		if _, err := policy.Decode(strings.NewReader(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}

func TestOfficialRPCDenyPrecedence(t *testing.T) {
	s := &engine{policy: policy.Policy{Rules: []policy.Rule{{ID: "OK", Effect: "ALLOW", Reason: "approved", Sources: []string{"moderator"}}, {ID: "SUSPENDED", Effect: "DENY", Reason: "Temporarily suspended agent", Destinations: []string{"schedule"}}}}, masID: func() (string, error) { return "mas", nil }}
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

func TestStoreReadFailureAndCancellation(t *testing.T) {
	for _, body := range []string{`{}`, `not-json`} {
		api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "GET" {
				t.Error("write after failed read")
			}
			w.Write([]byte(body))
		}))
		s := engine{policy: policy.Policy{Rules: []policy.Rule{{ID: "OK", Effect: "ALLOW", Sources: []string{"moderator"}}}}, masID: func() (string, error) { return "mas", nil }, store: &oxp.Store{Base: api.URL, Client: api.Client()}}
		if _, err := s.Evaluate(context.Background(), request()); status.Code(err) != codes.Unavailable {
			t.Fatalf("read failure: %v", err)
		}
		api.Close()
	}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer api.Close()
	s := engine{masID: func() (string, error) { return "mas", nil }, store: &oxp.Store{Base: api.URL, Client: api.Client()}}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	started := time.Now()
	_, err := s.Evaluate(ctx, request())
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
	s := engine{masID: func() (string, error) { return "mas", nil }, store: &oxp.Store{Base: api.URL, Client: api.Client()}}
	r := request()
	r.MasId = "foreign"
	got, err := s.Evaluate(context.Background(), r)
	if err != nil || got.Outcome != cev1.Decision_DECISION_DENY || got.ChecksRun[0].CheckId != "MAS_SCOPE" {
		t.Fatalf("scope decision %+v %v", got, err)
	}
}

func TestContentRulesDoNotChangeReferenceDecision(t *testing.T) {
	p, err := policy.Decode(strings.NewReader(`{"rules":[{"id":"APPROVED","effect":"ALLOW","reason":"approved route","sources":["moderator"],"destinations":["schedule"]}],"content_rules":[{"id":"SENSITIVE","reason":"No secret export","pattern":"password","destinations":["schedule"]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	s := engine{policy: p, masID: func() (string, error) { return "mas", nil }}
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
