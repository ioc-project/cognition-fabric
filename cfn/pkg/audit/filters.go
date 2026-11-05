// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import "fmt"

// ListFilters adds shared outcome and independent operational-success filters.
// Decision is retained as a legacy alias for three canonical outcomes.
type ListFilters struct {
	Outcome  string
	Decision string
	Success  *bool
}

// DecisionOutcome maps legacy query values to the common outcome vocabulary.
func (f ListFilters) DecisionOutcome() string {
	switch f.Decision {
	case "allow":
		return OutcomeAllow
	case "block":
		return OutcomeBlock
	case "modify":
		return OutcomeModifyRequested
	default:
		return ""
	}
}

// CanonicalOutcome resolves the legacy decision alias into the shared vocabulary.
func (f ListFilters) CanonicalOutcome() string {
	if f.Outcome != "" {
		return f.Outcome
	}
	return f.DecisionOutcome()
}

// Validate rejects unsupported or conflicting outcome filters.
func (f ListFilters) Validate() error {
	if f.Decision != "" && f.DecisionOutcome() == "" {
		return &ValidationError{msg: fmt.Sprintf("invalid decision: %s. Valid values: allow, block, modify", f.Decision)}
	}
	if f.Outcome != "" && !IsValidOutcome(f.Outcome) {
		return &ValidationError{msg: fmt.Sprintf("invalid outcome: %s", f.Outcome)}
	}
	if f.Decision != "" && f.Outcome != "" && f.DecisionOutcome() != f.Outcome {
		return &ValidationError{msg: "decision and outcome filters must agree"}
	}
	return nil
}

// Matches mirrors the database predicates for the in-memory store.
func (f ListFilters) Matches(a *Audit) bool {
	if f.Success != nil && (a.Success == nil || *a.Success != *f.Success) {
		return false
	}
	outcome := f.CanonicalOutcome()
	return outcome == "" || (a.Outcome != nil && *a.Outcome == outcome)
}
