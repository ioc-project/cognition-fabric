package evidence

import (
	"testing"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
)

func TestRuleJudgesTheRolesItNames(t *testing.T) {
	llm := Compile([]policy.ContentRule{{ID: "A", Pattern: "x", Evidence: policy.EvidenceLLMInput}})[0]
	for role, want := range map[string]bool{policy.RoleUser: true, policy.RoleTool: true, policy.RoleToolCall: true, policy.RoleSystem: false, policy.RoleToolDefinition: false} {
		if llm.Judges(role) != want {
			t.Errorf("default roles, %s: want %v", role, want)
		}
	}
	system := Compile([]policy.ContentRule{{ID: "B", Pattern: "x", Evidence: policy.EvidenceLLMInput, Roles: []string{policy.RoleSystem}}})[0]
	if !system.Judges(policy.RoleSystem) || system.Judges(policy.RoleUser) {
		t.Error("a rule with roles judges only those")
	}
	for _, kind := range []string{policy.EvidenceMCPToolInput, policy.EvidenceA2AMessageInput} {
		r := Compile([]policy.ContentRule{{ID: "C", Pattern: "x", Evidence: kind}})[0]
		if !r.Judges(RoleToolInput) || r.Judges(policy.RoleUser) {
			t.Errorf("%s judges tool input only", kind)
		}
	}
}
