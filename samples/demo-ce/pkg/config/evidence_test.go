package config

import (
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestNOAConfigKeepsEveryContentRuleWithoutProfiles(t *testing.T) {
	f, err := os.Open("testdata/noa-config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	p, err := Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, rule := range p.ContentRules {
		got[rule.ID] = rule.EvidenceKind()
	}
	want := map[string]string{
		"NOA_SENSITIVE_EXPORT": EvidenceA2AMessageInput, "NOA_PAYMENT_SECRET_COLLECTION": EvidenceA2AMessageInput,
		"NOA_SENSITIVE_DATA_EXPOSURE": EvidenceA2AMessageInput, "NOA_LLM_SENSITIVE_EXPORT": EvidenceLLMInput,
		"NOA_LLM_SENSITIVE_DATA_EXPOSURE": EvidenceLLMInput, "NOA_MCP_SENSITIVE_EXPORT": EvidenceMCPToolInput,
		"NOA_MCP_SENSITIVE_DATA_EXPOSURE": EvidenceMCPToolInput,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("content rules changed: %v", got)
	}
}

func TestEvidenceConfigurationIsValidatedWithoutProfiles(t *testing.T) {
	base := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":%s}`
	for name, rules := range map[string]string{
		"removed selector":               `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"events":"llm_input"}}]`,
		"unsupported evidence":           `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence":"response"}]`,
		"mixed destination input shapes": `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence":"llm_input"},{"id":"D","reason":"r","pattern":"y","destinations":["d"],"evidence":"mcp_tool_input"}]`,
		"roles outside model":            `[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence":"mcp_tool_input","roles":["user"]}]`,
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := Decode(strings.NewReader(strings.Replace(base, "%s", rules, 1))); err == nil {
				t.Fatal("invalid evidence configuration accepted")
			}
		})
	}
}
