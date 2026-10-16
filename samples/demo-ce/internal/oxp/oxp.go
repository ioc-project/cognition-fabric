// Package oxp is the client of OXP: the Cognition Store and the live topology of a session.
package oxp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/httpjson"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Client reads live topology.
type Client struct {
	Base string
	HTTP *http.Client
}

// Store is the OXP Cognition Store: findings of a MAS, read before and written after each decision.
type Store struct {
	Base   string
	Client *http.Client
}

func (s *Store) Read(ctx context.Context, r *cev1.EvaluateRequest) error {
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
	return nil
}
func (s *Store) Write(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, ruleID string) error {
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
	return nil
}

// Node is a node of OXP live topology of a session.
type Node struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Status    string `json:"status"`
	StartTime string `json:"start_time"`
	Data      struct {
		Input any `json:"input"`
	} `json:"data"`
}

// Topology reads the live topology of a session; a status other than 200 is no nodes.
func (c *Client) Topology(ctx context.Context, session string) ([]Node, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.Base+"/api/v1/live_topology/sessions/"+url.PathEscape(session)+"/topology", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}
	var body struct {
		Nodes []Node `json:"nodes"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&body); err != nil {
		return nil, err
	}
	return body.Nodes, nil
}

// toolPrefix is stripped from a destination identity before it is matched to an Observe tool name
// (CE_TOOL_PREFIX, empty by default).
var toolPrefix string
