// Package mcp judges mcp_tool_input evidence: the application publishes an MCP tools/call (tool name and
// arguments) as an Observe tool.started event before it sends it, and the CE finds it in the inbox by the
// exact trace and span of the submit, like llm_input. Only tools/call carries content: the proxy marks it
// with ioc.item.kind=tool_call (the /mcp-call route) and marks initialize, tools/list and server/discover
// as l9_message (the /mcp-control route), which are not judged and keep the identity decision.
//
// Limits: the arguments are published by the application itself; and only the request is judged, not the
// server's answer.
package mcp

import (
	"context"
	"encoding/json"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence/events"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

const itemKindToolCall = "tool_call"

// Judge is the judge of mcp_tool_input evidence.
type Judge struct{ events *events.Judge }

// New returns the judge of mcp_tool_input evidence.
func New(in *inbox.Inbox, wait time.Duration) *Judge {
	return &Judge{&events.Judge{Inbox: in, Wait: wait, Kind: config.EvidenceMCPToolInput, Extract: func(_ *cev1.EvaluateRequest, raw json.RawMessage) (string, []evidence.Text, bool) {
		return events.ToolTexts(raw)
	}}}
}

func (j *Judge) Evaluate(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []evidence.Rule, started time.Time) *cev1.EvaluateResponse {
	if r.Extra["ioc.item.kind"] != itemKindToolCall {
		return out // control traffic carries no content
	}
	return j.events.Evaluate(ctx, r, out, rules, started)
}
