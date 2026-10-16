package engine

import (
	"context"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// a2a_message_input evidence: the application publishes an A2A message (its text) as an Observe
// tool.started event before it sends it, with the message's messageId as the tool call id, and the CE finds
// it in the inbox by the exact trace and span of the submit, like llm_input and mcp_tool_input. The span is
// the one in the message's Observe carrier, which is what the proxy submits, so there is no matching by tool
// name, no stale-node guard, and calls in parallel to the same agent are told apart.
//
// When the submit carries the message id (ioc.observe.message_id) the event must carry the same one;
// an event for another message of the same span is ignored. The text is published by the application itself.

func (s *sessionEngine) evaluateA2A(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []compiledContentRule, started time.Time) *cev1.EvaluateResponse {
	want := r.Extra["ioc.observe.message_id"]
	extract := func(raw json.RawMessage) (string, []llmText, bool) {
		session, callID, texts, ok := preCallToolEvent(raw)
		if !ok || (want != "" && callID != "" && callID != want) {
			return "", nil, false
		}
		return session, texts, true
	}
	return s.evaluateFromInbox(ctx, r, out, rules, started, policy.EvidenceA2AMessageInput, extract)
}
