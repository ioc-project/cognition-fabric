// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package evidence

import (
	"testing"

	"github.com/ioc-project/cognition-fabric/samples/demo-ce/pkg/config"
)

func TestRuleJudgesTheRolesItNames(t *testing.T) {
	llm := Compile([]config.ContentRule{{ID: "A", Pattern: "x", Evidence: config.EvidenceLLMInput}})[0]
	for role, want := range map[string]bool{config.RoleUser: true, config.RoleTool: true, config.RoleToolCall: true, config.RoleSystem: false, config.RoleToolDefinition: false} {
		if llm.Judges(role) != want {
			t.Errorf("default roles, %s: want %v", role, want)
		}
	}
	system := Compile([]config.ContentRule{{ID: "B", Pattern: "x", Evidence: config.EvidenceLLMInput, Roles: []string{config.RoleSystem}}})[0]
	if !system.Judges(config.RoleSystem) || system.Judges(config.RoleUser) {
		t.Error("a rule with roles judges only those")
	}
	for _, kind := range []string{config.EvidenceMCPToolInput, config.EvidenceA2AMessageInput} {
		r := Compile([]config.ContentRule{{ID: "C", Pattern: "x", Evidence: kind}})[0]
		if !r.Judges(RoleToolInput) || r.Judges(config.RoleUser) {
			t.Errorf("%s judges tool input only", kind)
		}
	}
}
