package engine

import (
	"context"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// llm_input evidence: the application publishes the model request as an Observe llm.started event
// before it sends it, and the event exporter pushes that event to the CE inbox (events.go). The proxy
// submits the span of the same HTTP request, and the event's llm.call.id and correlation.span_id are
// that span, so the CE finds the request by the exact trace/span pair it was given. No topology
// lookup, no matching by name.
//
// Limits: the text is published from inside the application's own process, like the session reference,
// so a compromised agent could publish a different one. An SDK that emits llm.started only after the
// response leaves the CE without an event at decision time, which is missing context. The input is accepted in two shapes: the raw request (an object with messages) and the
// Observe SDK's GenAI messages (a list of {role, parts}). The model's response is not judged here: it only
// exists after the call, and reaches the CE as part of the next request.

// roleToolInput labels the arguments of an MCP tool call or the text of an A2A message (the roles a rule
// can name for model requests are in package policy).
const roleToolInput = "tool_input"

type llmStartedEvent struct {
	Type    string `json:"type"`
	Session struct {
		ID string `json:"id"`
	} `json:"session"`
	Data struct {
		Input json.RawMessage `json:"input"`
	} `json:"data"`
}

type llmRequest struct {
	Messages []struct {
		Role      string          `json:"role"`
		Content   json.RawMessage `json:"content"`
		ToolCalls []struct {
			Function struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			} `json:"function"`
		} `json:"tool_calls"`
	} `json:"messages"`
	Tools []struct {
		Function struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		} `json:"function"`
	} `json:"tools"`
}

type llmText struct {
	role string
	text string
}

// preCallLLMTexts returns the session and every judgeable text of the model request carried by a
// pre-call llm.started event, tagged with its role. ok is false for any other event or shape.
func preCallLLMTexts(raw json.RawMessage) (session string, texts []llmText, ok bool) {
	var event llmStartedEvent
	if json.Unmarshal(raw, &event) != nil || event.Type != "llm.started" {
		return "", nil, false
	}
	var request llmRequest
	if json.Unmarshal(event.Data.Input, &request) != nil || len(request.Messages) == 0 {
		// The Observe SDK publishes the input as GenAI messages, a list of {role, parts}.
		if texts, ok := genAIMessageTexts(event.Data.Input); ok {
			return event.Session.ID, texts, true
		}
		return "", nil, false
	}
	for _, m := range request.Messages {
		if text := messageText(m.Content); text != "" {
			texts = append(texts, llmText{m.Role, text})
		}
		for _, call := range m.ToolCalls {
			if call.Function.Arguments != "" {
				texts = append(texts, llmText{policy.RoleToolCall, call.Function.Arguments})
			}
		}
	}
	for _, tool := range request.Tools {
		if text := (tool.Function.Name + " " + tool.Function.Description); len(text) > 1 {
			texts = append(texts, llmText{policy.RoleToolDefinition, text})
		}
	}
	return event.Session.ID, texts, true
}

// genAIMessageTexts reads the input in the Observe SDK's GenAI shape: a list of messages with a role and
// parts. A text part is judged under the message's role, the arguments of a tool_call part under
// tool_call and the response of a tool_call_response part under tool.
func genAIMessageTexts(raw json.RawMessage) ([]llmText, bool) {
	var messages []struct {
		Role  string           `json:"role"`
		Parts []map[string]any `json:"parts"`
	}
	if json.Unmarshal(raw, &messages) != nil || len(messages) == 0 {
		return nil, false
	}
	var texts []llmText
	for _, m := range messages {
		for _, part := range m.Parts {
			role, value := m.Role, part["content"]
			switch part["type"] {
			case "tool_call":
				role, value = policy.RoleToolCall, part["arguments"]
			case "tool_call_response":
				role, value = policy.RoleTool, part["response"]
			}
			collectStrings(value, func(text string) { texts = append(texts, llmText{role, text}) })
		}
	}
	return texts, true
}

// messageText reads an OpenAI message content: a string, or a list of parts with a text field.
func messageText(content json.RawMessage) string {
	var text string
	if json.Unmarshal(content, &text) == nil {
		return text
	}
	var parts []struct {
		Text string `json:"text"`
	}
	if json.Unmarshal(content, &parts) != nil {
		return ""
	}
	joined := ""
	for _, p := range parts {
		if p.Text != "" {
			if joined != "" {
				joined += "\n"
			}
			joined += p.Text
		}
	}
	return joined
}

// judges reports whether the rule looks at texts of this role.
func (r compiledContentRule) judges(role string) bool {
	if r.EvidenceKind() == policy.EvidenceMCPToolInput || r.EvidenceKind() == policy.EvidenceA2AMessageInput {
		return role == roleToolInput
	}
	roles := r.Roles
	if len(roles) == 0 {
		roles = policy.DefaultRoles
	}
	for _, candidate := range roles {
		if candidate == role {
			return true
		}
	}
	return false
}

func (s *sessionEngine) evaluateLLM(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []compiledContentRule, started time.Time) *cev1.EvaluateResponse {
	return s.evaluateFromInbox(ctx, r, out, rules, started, policy.EvidenceLLMInput, preCallLLMTexts)
}
