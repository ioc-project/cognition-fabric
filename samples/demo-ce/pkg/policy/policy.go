// Package policy is the schema of a policy-ce policy file and its decoder: identity rules, content rules
// and the evidence profiles, for one MAS or for several.
package policy

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
type Policy struct {
	Rules        []Rule        `json:"rules"`
	ContentRules []ContentRule `json:"content_rules,omitempty"`
}

// Content rules are not applied by the identity layer. sessionEngine (oxp_session.go) evaluates them
// against the session context read from OXP and lists them in EnabledChecks.
//
// Evidence says where the text a rule judges comes from: "tool_input" (default) is the tool input of
// the session read from OXP live topology; "llm_input" is the model request the application published
// as a pre-call llm.started event, found in the event inbox by the exact trace/span of the submit.
//
// A rule can use the same evidence in every profile (evidence) or one per profile (evidence_by_profile), and
// then it only applies in the profiles it names. The profile is chosen at startup (CE_EVIDENCE): "topology"
// reads the session from OXP, which needs nothing from the application; "events" reads the content the
// application's Observe SDK publishes before each call. One policy file serves both.
type ContentRule struct {
	ID           string   `json:"id"`
	Reason       string   `json:"reason"`
	Pattern      string   `json:"pattern"`
	Destinations []string `json:"destinations"`
	// Sources narrows the rule to these calling identities; empty means any caller.
	Sources  []string `json:"sources,omitempty"`
	Evidence string   `json:"evidence,omitempty"`
	// EvidenceByProfile replaces Evidence when the evidence differs by profile; a profile it does not name
	// does not apply the rule.
	EvidenceByProfile map[string]string `json:"evidence_by_profile,omitempty"`
	// Roles (llm_input only) says which parts of the model request the rule judges: system, developer,
	// user, assistant, tool, tool_call (arguments of the assistant's tool calls) and tool_definition.
	// Empty means user, assistant, tool and tool_call.
	Roles []string `json:"roles,omitempty"`
}

const (
	ProfileTopology = "topology"
	ProfileEvents   = "events"
)

var evidenceProfiles = []string{ProfileTopology, ProfileEvents}

func knownEvidenceProfile(name string) bool {
	for _, p := range evidenceProfiles {
		if p == name {
			return true
		}
	}
	return false
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

// evidenceIn is the evidence the rule uses in a profile and whether the rule applies there.
func (r ContentRule) EvidenceIn(profile string) (string, bool) {
	if len(r.EvidenceByProfile) == 0 {
		return r.EvidenceKind(), true
	}
	e, ok := r.EvidenceByProfile[profile]
	return e, ok
}

// Decode reads a policy for the topology profile.
func Decode(r io.Reader) (Policy, error) { return DecodeFor(r, ProfileTopology) }

// DecodeFor reads a policy and keeps the content rules that apply in the profile, each with its evidence
// resolved. The whole file is validated for every profile, so a profile that is not selected cannot hide an error.
func DecodeFor(r io.Reader, profile string) (Policy, error) {
	if !knownEvidenceProfile(profile) {
		return Policy{}, fmt.Errorf("CE_EVIDENCE must be %s, got %q", strings.Join(evidenceProfiles, " or "), profile)
	}
	var p Policy
	d := json.NewDecoder(io.LimitReader(r, 65537))
	d.DisallowUnknownFields()
	if err := d.Decode(&p); err != nil {
		return p, err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return p, fmt.Errorf("policy must contain one JSON object")
	}
	return finishPolicy(p, profile)
}

// finishPolicy validates a decoded policy and keeps the content rules that apply in the profile.
func finishPolicy(p Policy, profile string) (Policy, error) {
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
	evidenceOf := map[string]map[string]string{}
	for _, name := range evidenceProfiles {
		evidenceOf[name] = map[string]string{}
	}
	var active []ContentRule
	for _, r := range p.ContentRules {
		if r.ID == "" || seen[r.ID] || r.Reason == "" || r.Pattern == "" || len(r.Destinations) == 0 {
			return p, fmt.Errorf("invalid content rule %q", r.ID)
		}
		if r.Evidence != "" && len(r.EvidenceByProfile) > 0 {
			return p, fmt.Errorf("content rule %q: use evidence or evidence_by_profile, not both", r.ID)
		}
		for name := range r.EvidenceByProfile {
			if !knownEvidenceProfile(name) {
				return p, fmt.Errorf("content rule %q: unknown evidence profile %q", r.ID, name)
			}
		}
		if _, err := regexp.Compile(r.Pattern); err != nil {
			return p, fmt.Errorf("content rule %q: %w", r.ID, err)
		}
		for _, s := range r.Sources {
			if strings.TrimSpace(s) == "" || strings.ContainsAny(s, "*?[]") {
				return p, fmt.Errorf("content rule %q requires literal source identities", r.ID)
			}
		}
		for _, name := range evidenceProfiles {
			evidence, applies := r.EvidenceIn(name)
			if !applies {
				continue
			}
			if evidence != EvidenceToolInput && evidence != EvidenceLLMInput && evidence != EvidenceMCPToolInput && evidence != EvidenceA2AMessageInput {
				return p, fmt.Errorf("content rule %q: evidence must be %q, %q, %q or %q", r.ID, EvidenceToolInput, EvidenceLLMInput, EvidenceMCPToolInput, EvidenceA2AMessageInput)
			}
			if len(r.Roles) > 0 && evidence != EvidenceLLMInput {
				return p, fmt.Errorf("content rule %q: roles apply to llm_input evidence only", r.ID)
			}
			// One destination is judged from one kind of evidence in a profile, so a decision never mixes sources.
			for _, d := range r.Destinations {
				if prior, ok := evidenceOf[name][d]; ok && prior != evidence {
					return p, fmt.Errorf("content rule %q: destination %q already uses %s evidence", r.ID, d, prior)
				}
				evidenceOf[name][d] = evidence
			}
		}
		for _, role := range r.Roles {
			if !KnownRoles[role] {
				return p, fmt.Errorf("content rule %q: unknown role %q", r.ID, role)
			}
		}
		seen[r.ID] = true
		if evidence, applies := r.EvidenceIn(profile); applies {
			r.Evidence, r.EvidenceByProfile = evidence, nil
			active = append(active, r)
		}
	}
	p.ContentRules = active
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
func (p Policy) Decide(source, destination string) Rule {
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
