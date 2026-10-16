package engine

import (
	"context"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// mcp_tool_input evidence: the application publishes an MCP tools/call (tool name and arguments) as an
// Observe tool.started event before it sends it, and the CE finds it in the inbox by the exact trace and
// span of the submit, like llm_input. Only tools/call carries content: the proxy marks it with
// ioc.item.kind=tool_call (the /mcp-call route) and marks initialize, tools/list and server/discover
// as l9_message (the /mcp-control route), which are not judged and keep the identity decision.
//
// Limits: the arguments are published by the application itself; and only the request is judged, not the
// server's answer.

const itemKindToolCall = "tool_call"

type toolStartedEvent struct {
	Type    string `json:"type"`
	Session struct {
		ID string `json:"id"`
	} `json:"session"`
	Data struct {
		Tool struct {
			Name   string `json:"name"`
			CallID string `json:"call_id"`
		} `json:"tool"`
		Input json.RawMessage `json:"input"`
	} `json:"data"`
}

// preCallToolTexts returns the session and every string of the arguments of a pre-call tool.started event.
func preCallToolTexts(raw json.RawMessage) (session string, texts []llmText, ok bool) {
	session, _, texts, ok = preCallToolEvent(raw)
	return session, texts, ok
}

// preCallToolEvent also returns the call id the event carries (an A2A messageId).
func preCallToolEvent(raw json.RawMessage) (session, callID string, texts []llmText, ok bool) {
	var event toolStartedEvent
	if json.Unmarshal(raw, &event) != nil || event.Type != "tool.started" || event.Data.Tool.Name == "" || len(event.Data.Input) == 0 {
		return "", "", nil, false
	}
	var input any
	if json.Unmarshal(event.Data.Input, &input) != nil {
		return "", "", nil, false
	}
	// The exporter may deliver the arguments as an object or as a JSON string holding one.
	if text, isText := input.(string); isText {
		var inner any
		if json.Unmarshal([]byte(text), &inner) == nil {
			input = inner
		}
	}
	collectStrings(input, func(text string) { texts = append(texts, llmText{roleToolInput, text}) })
	return event.Session.ID, event.Data.Tool.CallID, texts, true
}

func collectStrings(value any, add func(string)) {
	switch v := value.(type) {
	case string:
		if v != "" {
			add(v)
		}
	case []any:
		for _, item := range v {
			collectStrings(item, add)
		}
	case map[string]any:
		for _, item := range v {
			collectStrings(item, add)
		}
	}
}

func (s *sessionEngine) evaluateMCP(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []compiledContentRule, started time.Time) *cev1.EvaluateResponse {
	if r.Extra["ioc.item.kind"] != itemKindToolCall {
		return out // control traffic carries no content
	}
	return s.evaluateFromInbox(ctx, r, out, rules, started, policy.EvidenceMCPToolInput, preCallToolTexts)
}
