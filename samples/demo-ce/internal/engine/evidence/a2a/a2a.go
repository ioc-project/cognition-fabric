// Package a2a judges a2a_message_input evidence: the application publishes an A2A message (its text) as an
// Observe tool.started event before it sends it, with the message's messageId as the tool call id, and the
// CE finds it in the inbox by the exact trace and span of the submit, like llm_input and mcp_tool_input. The
// span is the one in the message's Observe carrier, which is what the proxy submits, so there is no matching
// by tool name, no stale-node guard, and calls in parallel to the same agent are told apart.
//
// When the submit carries the message id (ioc.observe.message_id) the event must carry the same one; an
// event for another message of the same span is ignored. The text is published by the application itself.
package a2a

import (
	"encoding/json"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence/events"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// New returns the judge of a2a_message_input evidence.
func New(in *inbox.Inbox, wait time.Duration) *events.Judge {
	return &events.Judge{Inbox: in, Wait: wait, Kind: config.EvidenceA2AMessageInput, Extract: func(r *cev1.EvaluateRequest, raw json.RawMessage) (string, []evidence.Text, bool) {
		want := r.Extra["ioc.observe.message_id"]
		session, callID, texts, ok := events.ToolEvent(raw)
		if !ok || (want != "" && callID != "" && callID != want) {
			return "", nil, false
		}
		return session, texts, true
	}}
}
