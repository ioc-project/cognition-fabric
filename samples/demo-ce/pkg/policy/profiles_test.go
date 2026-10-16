package policy

import (
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
)

const shippedPolicy = "testdata/noa-policy.json"

func shippedPolicyFor(t *testing.T, profile string) Policy {
	t.Helper()
	file, err := os.Open(shippedPolicy)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	p, err := DecodeFor(file, profile)
	if err != nil {
		t.Fatalf("profile %s: %v", profile, err)
	}
	return p
}

func contentRuleEvidence(p Policy) map[string]string {
	out := map[string]string{}
	for _, r := range p.ContentRules {
		out[r.ID] = r.EvidenceKind()
	}
	return out
}

// One policy file serves both ways of reading content, so the identity rules and the A2A rule text are
// defined once and only the evidence differs by profile.
func TestShippedPolicyServesBothEvidenceProfiles(t *testing.T) {
	topology := shippedPolicyFor(t, ProfileTopology)
	events := shippedPolicyFor(t, ProfileEvents)
	if !reflect.DeepEqual(topology.Rules, events.Rules) {
		t.Error("the identity rules must not depend on the evidence profile")
	}
	wantTopology := map[string]string{
		"NOA_SENSITIVE_EXPORT": EvidenceToolInput, "NOA_PAYMENT_SECRET_COLLECTION": EvidenceToolInput, "NOA_SENSITIVE_DATA_EXPOSURE": EvidenceToolInput,
	}
	if got := contentRuleEvidence(topology); !reflect.DeepEqual(got, wantTopology) {
		t.Errorf("topology profile: %v, want %v", got, wantTopology)
	}
	wantEvents := map[string]string{
		"NOA_SENSITIVE_EXPORT": EvidenceA2AMessageInput, "NOA_PAYMENT_SECRET_COLLECTION": EvidenceA2AMessageInput, "NOA_SENSITIVE_DATA_EXPOSURE": EvidenceA2AMessageInput,
		"NOA_LLM_SENSITIVE_EXPORT": EvidenceLLMInput, "NOA_LLM_SENSITIVE_DATA_EXPOSURE": EvidenceLLMInput,
		"NOA_MCP_SENSITIVE_EXPORT": EvidenceMCPToolInput, "NOA_MCP_SENSITIVE_DATA_EXPOSURE": EvidenceMCPToolInput,
	}
	if got := contentRuleEvidence(events); !reflect.DeepEqual(got, wantEvents) {
		t.Errorf("events profile: %v, want %v", got, wantEvents)
	}
	byID := func(p Policy) map[string]ContentRule {
		m := map[string]ContentRule{}
		for _, r := range p.ContentRules {
			m[r.ID] = r
		}
		return m
	}
	shared := byID(topology)
	for id, r := range byID(events) {
		other, ok := shared[id]
		if !ok {
			continue
		}
		if other.Pattern != r.Pattern || !reflect.DeepEqual(other.Destinations, r.Destinations) || other.Reason != r.Reason {
			t.Errorf("rule %s must be the same text in both profiles", id)
		}
	}
}

func TestPolicyEvidenceByProfile(t *testing.T) {
	base := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":%s}`
	cases := []struct {
		name, rules string
		valid       bool
	}{
		{"one rule, evidence by profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"topology":"tool_input","events":"a2a_message_input"}}]`, true},
		{"rule only in the events profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["noa-llm"],"evidence_by_profile":{"events":"llm_input"}}]`, true},
		{"both evidence fields", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence":"tool_input","evidence_by_profile":{"events":"llm_input"}}]`, false},
		{"unknown profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"live":"llm_input"}}]`, false},
		{"unknown evidence in a profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"events":"response"}}]`, false},
		{"destination mixes evidence inside the events profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"events":"llm_input"}},{"id":"D","reason":"r","pattern":"y","destinations":["d"],"evidence_by_profile":{"events":"mcp_tool_input"}}]`, false},
		{"same destination, different evidence in different profiles", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"topology":"tool_input"}},{"id":"D","reason":"r","pattern":"y","destinations":["d"],"evidence_by_profile":{"events":"llm_input"}}]`, true},
		{"roles on a rule that is not llm_input in the events profile", `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"roles":["tool"],"evidence_by_profile":{"events":"mcp_tool_input"}}]`, false},
	}
	for _, tc := range cases {
		for _, profile := range evidenceProfiles {
			_, err := DecodeFor(strings.NewReader(strings.Replace(base, "%s", tc.rules, 1)), profile)
			if (err == nil) != tc.valid {
				t.Errorf("%s (profile %s): valid=%v err=%v", tc.name, profile, tc.valid, err)
			}
		}
	}
}

// An error in the profile that is not selected must not stay hidden until someone selects it.
func TestPolicyIsValidatedForEveryProfileWhateverIsSelected(t *testing.T) {
	body := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":[` +
		`{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"topology":"tool_input","events":"llm_input"}},` +
		`{"id":"D","reason":"r","pattern":"y","destinations":["d"],"evidence_by_profile":{"events":"mcp_tool_input"}}]}`
	if _, err := DecodeFor(strings.NewReader(body), ProfileTopology); err == nil {
		t.Error("the conflict in the events profile must be reported while the topology profile is selected")
	}
}

func TestStringEvidenceAppliesToEveryProfile(t *testing.T) {
	body := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":[{"id":"C","reason":"r","pattern":"x","destinations":["noa-llm"],"evidence":"llm_input"}]}`
	for _, profile := range evidenceProfiles {
		p, err := DecodeFor(strings.NewReader(body), profile)
		if err != nil || len(p.ContentRules) != 1 || p.ContentRules[0].EvidenceKind() != EvidenceLLMInput {
			t.Errorf("profile %s: %+v err=%v", profile, p.ContentRules, err)
		}
	}
}

func TestUnknownEvidenceProfileIsRejected(t *testing.T) {
	body := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}]}`
	_, err := DecodeFor(strings.NewReader(body), "live")
	if err == nil || !strings.Contains(err.Error(), "CE_EVIDENCE") {
		t.Errorf("err=%v", err)
	}
	known := append([]string{}, evidenceProfiles...)
	sort.Strings(known)
	if !reflect.DeepEqual(known, []string{"events", "topology"}) {
		t.Errorf("profiles: %v", known)
	}
}
