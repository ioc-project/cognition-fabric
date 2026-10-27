// Package config is the schema of a demo-ce config file and its decoder: identity rules, content rules
// for one MAS or for several.
package config

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"
)

type Rule struct {
	ID           string   `json:"id"`
	Effect       string   `json:"effect"`
	Reason       string   `json:"reason"`
	Sources      []string `json:"sources,omitempty"`
	Destinations []string `json:"destinations,omitempty"`
}
type Config struct {
	Rules        []Rule        `json:"rules"`
	ContentRules []ContentRule `json:"content_rules,omitempty"`
}

// ContentRule applies after identity allows a route. Evidence selects the input
// shape (tool, model, MCP or A2A); the unified resolver joins pre-call events with
// OXP span context.
type ContentRule struct {
	ID           string   `json:"id"`
	Reason       string   `json:"reason"`
	Pattern      string   `json:"pattern"`
	Destinations []string `json:"destinations"`
	// Sources narrows the rule to these calling identities; empty means any caller.
	Sources  []string `json:"sources,omitempty"`
	Evidence string   `json:"evidence,omitempty"`
	// Roles (llm_input only) says which parts of the model request the rule judges: system, developer,
	// user, assistant, tool, tool_call (arguments of the assistant's tool calls) and tool_definition.
	// Empty means user, assistant, tool and tool_call.
	Roles []string `json:"roles,omitempty"`
}

const (
	EvidenceToolInput = "tool_input"
	EvidenceLLMInput  = "llm_input"
	// EvidenceMCPToolInput judges the arguments of an MCP tools/call published before it is sent.
	EvidenceMCPToolInput = "mcp_tool_input"
	// EvidenceA2AMessageInput judges the text of an A2A message published before it is sent.
	EvidenceA2AMessageInput = "a2a_message_input"
)

func (r ContentRule) EvidenceKind() string {
	if r.Evidence == "" {
		return EvidenceToolInput
	}
	return r.Evidence
}

// Decode reads and validates one config.
func Decode(r io.Reader) (Config, error) {
	var p Config
	d := json.NewDecoder(io.LimitReader(r, 65537))
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return p, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return p, fmt.Errorf("config must contain one JSON object")
	}
	return finishConfig(p)
}

// finishConfig validates all rules without selecting a runtime mode.
func finishConfig(p Config) (Config, error) {
	if len(p.Rules) == 0 {
		return p, fmt.Errorf("at least one scoped rule required")
	}
	seen := map[string]bool{}
	for _, r := range p.Rules {
		if r.ID == "" || seen[r.ID] || r.Reason == "" || (r.Effect != "ALLOW" && r.Effect != "DENY") || (len(r.Sources) == 0 && len(r.Destinations) == 0) {
			return p, fmt.Errorf("invalid rule %q", r.ID)
		}
		seen[r.ID] = true
		for _, s := range append(append([]string{}, r.Sources...), r.Destinations...) {
			if strings.TrimSpace(s) == "" || strings.ContainsAny(s, "*?[]") {
				return p, fmt.Errorf("rule %q requires literal identities", r.ID)
			}
		}
	}
	evidenceOf := map[string]string{}
	for _, r := range p.ContentRules {
		if r.ID == "" || seen[r.ID] || r.Reason == "" || r.Pattern == "" || len(r.Destinations) == 0 {
			return p, fmt.Errorf("invalid content rule %q", r.ID)
		}
		if _, err := regexp.Compile(r.Pattern); err != nil {
			return p, fmt.Errorf("content rule %q: %w", r.ID, err)
		}
		for _, s := range r.Sources {
			if strings.TrimSpace(s) == "" || strings.ContainsAny(s, "*?[]") {
				return p, fmt.Errorf("content rule %q requires literal source identities", r.ID)
			}
		}
		evidence := r.EvidenceKind()
		if evidence != EvidenceToolInput && evidence != EvidenceLLMInput && evidence != EvidenceMCPToolInput && evidence != EvidenceA2AMessageInput {
			return p, fmt.Errorf("content rule %q: unsupported evidence %q", r.ID, evidence)
		}
		if len(r.Roles) > 0 && evidence != EvidenceLLMInput {
			return p, fmt.Errorf("content rule %q: roles apply to llm_input evidence only", r.ID)
		}
		for _, d := range r.Destinations {
			if prior, ok := evidenceOf[d]; ok && prior != evidence {
				return p, fmt.Errorf("content rule %q: destination %q already uses %s evidence", r.ID, d, prior)
			}
			evidenceOf[d] = evidence
		}
		for _, role := range r.Roles {
			if !KnownRoles[role] {
				return p, fmt.Errorf("content rule %q: unknown role %q", r.ID, role)
			}
		}
		seen[r.ID] = true
	}

	return p, nil
}
func Matches(values []string, value string) bool {
	if len(values) == 0 {
		return true
	}
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

// Decide is the identity decision for a route: DENY overrides ALLOW and an unmatched route is denied.
func (p Config) Decide(source, destination string) Rule {
	var allow *Rule
	for _, v := range p.Rules {
		if Matches(v.Sources, source) && Matches(v.Destinations, destination) {
			if v.Effect == "DENY" {
				return v
			}
			copy := v
			if allow == nil {
				allow = &copy
			}
		}
	}
	if allow != nil {
		return *allow
	}
	return Rule{ID: "DEFAULT_DENY", Effect: "DENY", Reason: "Source and destination are outside approved routes"}
}

// Roles a content rule can judge on model-request evidence. A rule without "roles" judges DefaultRoles, so the
// application's own system prompt and the static tool definitions are only judged when a rule asks for them.
const (
	RoleSystem         = "system"
	RoleDeveloper      = "developer"
	RoleUser           = "user"
	RoleAssistant      = "assistant"
	RoleTool           = "tool"
	RoleToolCall       = "tool_call"       // arguments of a tool call the assistant made
	RoleToolDefinition = "tool_definition" // name and description of a tool offered to the model
)

var (
	DefaultRoles = []string{RoleUser, RoleAssistant, RoleTool, RoleToolCall}
	KnownRoles   = map[string]bool{RoleSystem: true, RoleDeveloper: true, RoleUser: true, RoleAssistant: true, RoleTool: true, RoleToolCall: true, RoleToolDefinition: true}
)
