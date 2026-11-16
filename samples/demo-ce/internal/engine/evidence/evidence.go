// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package evidence is what a content rule is judged against. A Judge reads one kind of evidence (the
// "evidence" of a rule in the config file) and decides whether the request passes the rules that use it.
// The kinds use the correlation resolver, with llm, mcp and a2a parsers for events the
// application publishes before the call.
package evidence

import (
	"context"
	"regexp"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/pkg/config"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Judge decides a request whose identity decision was ALLOW, from one kind of evidence. rules are the
// content rules that apply to the route and all use this judge's evidence. It adds its check to out and
// returns it, denying when a rule hits or the evidence is missing.
type Judge interface {
	Evaluate(ctx context.Context, r *cev1.EvaluateRequest, out *cev1.EvaluateResponse, rules []Rule, started time.Time) *cev1.EvaluateResponse
}

// Rule is a content rule with its pattern compiled.
type Rule struct {
	config.ContentRule
	Re *regexp.Regexp
}

// Compile compiles the patterns of rules; the config decoder has already validated them.
func Compile(rules []config.ContentRule) []Rule {
	out := make([]Rule, 0, len(rules))
	for _, r := range rules {
		out = append(out, Rule{r, regexp.MustCompile(r.Pattern)})
	}
	return out
}

// Text is a piece of the evidence with the role it plays, which decides whether a rule judges it.
type Text struct {
	Role string
	Text string
}

// RoleToolInput labels the arguments of an MCP tool call or the text of an A2A message (the roles a rule
// can name for model requests are in package config).
const RoleToolInput = "tool_input"

// Judges reports whether the rule looks at texts of this role.
func (r Rule) Judges(role string) bool {
	if k := r.EvidenceKind(); k == config.EvidenceMCPToolInput || k == config.EvidenceA2AMessageInput {
		return role == RoleToolInput
	}
	roles := r.Roles
	if len(roles) == 0 {
		roles = config.DefaultRoles
	}
	for _, candidate := range roles {
		if candidate == role {
			return true
		}
	}
	return false
}

// MissingContext denies out because the evidence the rules need is not available.
func MissingContext(out *cev1.EvaluateResponse, cause cev1.MissingContextCause, reason string) *cev1.EvaluateResponse {
	out.Outcome = cev1.Decision_DECISION_DENY
	out.DenialReason = cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT.Enum()
	out.MissingContextCause = cause.Enum()
	out.Reason = reason
	out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_SESSION_CONTEXT", Passed: false, Reason: reason})
	return out
}
