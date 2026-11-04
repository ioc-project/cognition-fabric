// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"encoding/json"
	"fmt"
)

// ListFilters adds optional policy-decision and whole-flow success filters.
// A nil Success and an empty Decision leave the corresponding field unfiltered.
type ListFilters struct {
	Decision string
	Success  *bool
}

// DecisionOutcome maps the displayed Block action to the recorded CE DENY decision.
func (f ListFilters) DecisionOutcome() string {
	switch f.Decision {
	case "allow":
		return "DECISION_ALLOW"
	case "block":
		return "DECISION_DENY"
	case "modify":
		return "DECISION_MODIFY"
	default:
		return ""
	}
}

// Validate rejects unsupported policy-decision filters.
func (f ListFilters) Validate() error {
	if f.Decision != "" && f.DecisionOutcome() == "" {
		return &ValidationError{msg: fmt.Sprintf("invalid decision: %s. Valid values: allow, block, modify", f.Decision)}
	}
	return nil
}

// Matches mirrors the database predicates for the in-memory store.
func (f ListFilters) Matches(a *Audit) bool {
	if f.Success != nil && (a.Success == nil || *a.Success != *f.Success) {
		return false
	}
	if f.Decision == "" {
		return true
	}
	if a.Source != SourceCFN || a.ResourceType != ResourceTypeCognitionEngine ||
		(a.AuditType != AuditTypeCEInvoked && a.AuditType != AuditTypeCENotInvoked) {
		return false
	}
	var info struct {
		Outcome string `json:"outcome"`
	}
	return json.Unmarshal(a.AuditInformation, &info) == nil && info.Outcome == f.DecisionOutcome()
}
