// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package events

import (
	"encoding/json"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/engine/evidence"
)

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

// ToolTexts returns the session and every string of the arguments of a pre-call tool.started event.
func ToolTexts(raw json.RawMessage) (session string, texts []evidence.Text, ok bool) {
	session, _, texts, ok = ToolEvent(raw)
	return session, texts, ok
}

// ToolEvent also returns the call id the event carries (an A2A messageId).
func ToolEvent(raw json.RawMessage) (session, callID string, texts []evidence.Text, ok bool) {
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
	CollectStrings(input, func(text string) { texts = append(texts, evidence.Text{Role: evidence.RoleToolInput, Text: text}) })
	return event.Session.ID, event.Data.Tool.CallID, texts, true
}

// CollectStrings calls add with every non-empty string inside value (strings, lists and objects).
func CollectStrings(value any, add func(string)) {
	switch v := value.(type) {
	case string:
		if v != "" {
			add(v)
		}
	case []any:
		for _, item := range v {
			CollectStrings(item, add)
		}
	case map[string]any:
		for _, item := range v {
			CollectStrings(item, add)
		}
	}
}
