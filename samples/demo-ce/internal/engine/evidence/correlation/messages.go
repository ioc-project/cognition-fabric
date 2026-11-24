// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package correlation

import (
	"encoding/json"
	"strings"

	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/engine/evidence"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/engine/evidence/events"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
)

// Reject unknown/partial message shapes instead of turning missing content into
// an empty list that would silently pass every content rule.
func modelInput(raw json.RawMessage) ([]evidence.Text, bool, bool) {
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return nil, false, false
	}
	return modelInputValue(value)
}

// Validate and extract from the same decoded value. Conversations can approach
// the inbox byte limit, so repeated JSON decoding wastes the decision budget.
func modelInputValue(value any) ([]evidence.Text, bool, bool) {
	if !validLLMValue(value) {
		return nil, false, false
	}
	var texts []evidence.Text
	request, rawRequest := value.(map[string]any)
	if rawRequest {
		value = request["messages"]
		definitions, _ := toolDefinitionTexts(request["tools"])
		texts = append(texts, definitions...)
	}
	for _, item := range value.([]any) {
		message := item.(map[string]any)
		role := message["role"].(string)
		if rawRequest {
			text, _ := message["content"].(string)
			if parts, ok := message["content"].([]any); ok {
				var chunks []string
				for _, item := range parts {
					if part := item.(map[string]any)["text"].(string); part != "" {
						chunks = append(chunks, part)
					}
				}
				text = strings.Join(chunks, "\n")
			}
			if text != "" {
				texts = append(texts, evidence.Text{Role: role, Text: text})
			}
			calls, _ := message["tool_calls"].([]any)
			for _, item := range calls {
				args := item.(map[string]any)["function"].(map[string]any)["arguments"].(string)
				if args != "" {
					texts = append(texts, evidence.Text{Role: config.RoleToolCall, Text: args})
				}
			}
		} else {
			for _, item := range message["parts"].([]any) {
				part := item.(map[string]any)
				partRole, content := role, part["content"]
				switch part["type"] {
				case "tool_call":
					partRole, content = config.RoleToolCall, part["arguments"]
				case "tool_call_response":
					partRole, content = config.RoleTool, part["response"]
				}
				events.CollectStrings(content, func(text string) { texts = append(texts, evidence.Text{Role: partRole, Text: text}) })
			}
		}
	}
	return texts, rawRequest, true
}

func validLLMValue(value any) bool {
	genAI := true
	if request, ok := value.(map[string]any); ok {
		if tools, present := request["tools"]; present {
			if _, valid := toolDefinitionTexts(tools); !valid {
				return false
			}
		}
		value = request["messages"]
		genAI = false
	}
	messages, ok := value.([]any)
	if !ok || len(messages) == 0 {
		return false
	}
	for _, item := range messages {
		message, ok := item.(map[string]any)
		if !ok {
			return false
		}
		role, ok := message["role"].(string)
		if !ok || (role != "system" && role != "developer" && role != "user" && role != "assistant" && role != "tool") {
			return false
		}
		if genAI {
			parts, ok := message["parts"].([]any)
			if !ok || len(parts) == 0 {
				return false
			}
			for _, rawPart := range parts {
				part, ok := rawPart.(map[string]any)
				if !ok {
					return false
				}
				switch part["type"] {
				case "text":
					if _, ok := part["content"].(string); !ok {
						return false
					}
				case "tool_call":
					if _, ok := part["arguments"]; !ok {
						return false
					}
				case "tool_call_response":
					if _, ok := part["response"]; !ok {
						return false
					}
				default:
					return false
				}
			}
		} else {
			calls, isCalls := message["tool_calls"].([]any)
			if raw, exists := message["tool_calls"]; exists && raw != nil && !isCalls {
				return false
			}
			content, present := message["content"]
			if !present || content == nil {
				if len(calls) == 0 {
					return false
				}
			} else {
				switch v := content.(type) {
				case string:
				case []any:
					for _, item := range v {
						part, ok := item.(map[string]any)
						if !ok {
							return false
						}
						if _, ok := part["text"].(string); !ok {
							return false
						}
					}
				default:
					return false
				}
			}
			for _, item := range calls {
				call, ok := item.(map[string]any)
				if !ok {
					return false
				}
				function, ok := call["function"].(map[string]any)
				if !ok {
					return false
				}
				if _, ok := function["arguments"].(string); !ok {
					return false
				}
			}
		}
	}
	return true
}

func definitionTexts(s oxp.Span) ([]evidence.Text, bool) {
	value, ok := attribute(s, "gen_ai.tool.definitions")
	if !ok || value == nil {
		return nil, false
	}
	return toolDefinitionTexts(value)
}

func toolDefinitionTexts(value any) ([]evidence.Text, bool) {
	if value == nil {
		return nil, true // an explicit null or absent tools list means no definitions
	}
	definitions, ok := value.([]any)
	if !ok {
		return nil, false
	}
	var texts []evidence.Text
	for _, item := range definitions {
		definition, ok := item.(map[string]any)
		if !ok {
			return nil, false
		}
		if function, exists := definition["function"]; exists {
			definition, ok = function.(map[string]any)
			if !ok {
				return nil, false
			}
		}
		name, ok := definition["name"].(string)
		if !ok || name == "" {
			return nil, false
		}
		description := ""
		if value, exists := definition["description"]; exists {
			description, ok = value.(string)
			if !ok {
				return nil, false
			}
		}
		texts = append(texts, evidence.Text{Role: config.RoleToolDefinition, Text: name + " " + description})
	}
	return texts, true
}

func hasDefinitions(s oxp.Span) bool { _, ok := definitionTexts(s); return ok }
