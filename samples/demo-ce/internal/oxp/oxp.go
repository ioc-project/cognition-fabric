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

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/httpjson"
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
