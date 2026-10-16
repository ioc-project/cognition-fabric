package engine

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestRouterUsesThePolicyOfTheRequestsMAS(t *testing.T) {
	set, err := policy.DecodeSet(strings.NewReader(`{"mas":[
	 {"mas_id":"mas-a","rules":[{"id":"A_OK","effect":"ALLOW","reason":"a","sources":["x"],"destinations":["y"]}]},
	 {"mas_id":"mas-b","rules":[{"id":"B_OK","effect":"ALLOW","reason":"b","sources":["x"],"destinations":["z"]}]}]}`), policy.ProfileTopology)
	if err != nil {
		t.Fatal(err)
	}
	rt := &Router{byMAS: map[string]*sessionEngine{}, order: set.Order}
	for _, id := range set.Order {
		id := id
		rt.byMAS[id] = newSessionEngine(&engine{policy: set.ByMAS[id], masID: func() (string, error) { return id, nil }}, "http://127.0.0.1:1", time.Second)
	}
	req := func(mas, dst string) *cev1.EvaluateRequest {
		return &cev1.EvaluateRequest{MasId: mas, SourceAgentId: "x", DestinationAgentId: dst, TraceId: trace, SpanId: "1111111111111111"}
	}
	for _, c := range []struct {
		mas, dst string
		want     cev1.Decision
		check    string
	}{
		{"mas-a", "y", cev1.Decision_DECISION_ALLOW, "A_OK"},
		{"mas-a", "z", cev1.Decision_DECISION_DENY, "DEFAULT_DENY"},
		{"mas-b", "z", cev1.Decision_DECISION_ALLOW, "B_OK"},
		{"mas-c", "y", cev1.Decision_DECISION_DENY, "MAS_SCOPE"},
	} {
		out, err := rt.Evaluate(context.Background(), req(c.mas, c.dst))
		if err != nil || out.Outcome != c.want || out.ChecksRun[0].CheckId != c.check {
			t.Errorf("%s->%s: out=%+v err=%v", c.mas, c.dst, out, err)
		}
	}
	if _, err := rt.Evaluate(context.Background(), &cev1.EvaluateRequest{}); status.Code(err) != codes.InvalidArgument {
		t.Errorf("empty request: %v", err)
	}
	info, err := rt.GetInfo(context.Background(), &cev1.GetInfoRequest{})
	if err != nil || len(info.EnabledChecks) != 4 {
		t.Errorf("info=%+v err=%v", info, err)
	}
}
