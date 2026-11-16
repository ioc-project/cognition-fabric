// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package correlation

import (
	"encoding/json"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/engine/evidence"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/engine/evidence/events"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/internal/oxp"
	"github.com/cisco-eti/cognition-fabric/samples/demo-ce/pkg/config"
)

// attribute decodes both string-valued OTel attributes and structured JSON values.
func attribute(s oxp.Span, name string) (any, bool) {
	raw, ok := s.Attributes[name]
	if !ok {
		return nil, false
	}
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return nil, false
	}
	return unpack(value), true
}

// Observe can serialize known request wrappers as JSON inside JSON strings.
func unpack(value any) any {
	for n := 0; n < 4; n++ {
		text, ok := value.(string)
		if !ok {
			break
		}
		var decoded any
		if json.Unmarshal([]byte(text), &decoded) != nil {
			break
		}
		value = decoded
	}
	return value
}

func inputTexts(s oxp.Span, kind string) ([]evidence.Text, bool) {
	if kind == config.EvidenceLLMInput {
		input, ok := attribute(s, "gen_ai.input.messages")
		if !ok {
			return nil, false
		}
		texts, _, valid := modelInputValue(input)
		if defs, ok := definitionTexts(s); ok {
			texts = append(texts, defs...)
		}
		return texts, valid
	}
	input, ok := attribute(s, "ioa_observe.entity.input")
	if kind == config.EvidenceMCPToolInput {
		method, _ := attribute(s, "mcp.method.name")
		if method == "tools/call" {
			input, ok = attribute(s, "mcp.request.argument")
		} else if ok {
			request, valid := unpack(input).(map[string]any)
			if !valid {
				return nil, false
			}
			if root, present := request["root"]; present {
				request, valid = unpack(root).(map[string]any)
				if !valid {
					return nil, false
				}
			}
			if request["method"] != "tools/call" {
				return nil, false
			}
			input, ok = request["params"]
		}
		params, valid := unpack(input).(map[string]any)
		if !ok || !valid {
			return nil, false
		}
		name, _ := params["name"].(string)
		input, ok = params["arguments"]
		if name == "" || !ok {
			return nil, false
		}
		if _, valid := unpack(input).(map[string]any); !valid {
			return nil, false
		}
		input = unpack(input)
	} else {
		// The decorated task input must belong to the selected tool span. A
		// transport span without input cannot borrow its enclosing task's bytes.
		if s.Type != "tool" {
			return nil, false
		}
		object, valid := unpack(input).(map[string]any)
		if !ok || !valid {
			return nil, false
		}
		_, args := object["args"]
		_, kwargs := object["kwargs"]
		if !args && !kwargs {
			return nil, false
		}
		input = object
	}
	var texts []evidence.Text
	events.CollectStrings(input, func(text string) { texts = append(texts, evidence.Text{Role: evidence.RoleToolInput, Text: text}) })
	return texts, true
}
