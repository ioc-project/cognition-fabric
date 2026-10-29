// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import "encoding/json"

const (
	OutcomeAllow           = "ALLOW"
	OutcomeBlock           = "BLOCK"
	OutcomeModifyRequested = "MODIFY_REQUESTED"
	OutcomeError           = "ERROR"
	OutcomeDegraded        = "DEGRADED"
	OutcomeUnsupported     = "UNSUPPORTED"
	OutcomeUnknown         = "UNKNOWN"
)

// NormalizeOutcome projects source evidence without changing its original value.
func NormalizeOutcome(value string) string {
	switch value {
	case "DECISION_ALLOW", "APPLIED_OUTCOME_ALLOWED":
		return OutcomeAllow
	case "DECISION_DENY", "APPLIED_OUTCOME_BLOCKED":
		return OutcomeBlock
	case "DECISION_MODIFY":
		return OutcomeModifyRequested
	case "ERROR":
		return OutcomeError
	case "APPLIED_OUTCOME_DEGRADED":
		return OutcomeDegraded
	case "APPLIED_OUTCOME_UNSUPPORTED":
		return OutcomeUnsupported
	default:
		return OutcomeUnknown
	}
}

func IsValidOutcome(value string) bool {
	switch value {
	case OutcomeAllow, OutcomeBlock, OutcomeModifyRequested, OutcomeError, OutcomeDegraded, OutcomeUnsupported, OutcomeUnknown:
		return true
	}
	return false
}

// PopulateCFNOutcome also covers callers of the generic writer and test store.
func PopulateCFNOutcome(a *Audit) {
	if a.Outcome != nil || a.Source != SourceCFN || a.ResourceType != ResourceTypeCognitionEngine ||
		(a.AuditType != AuditTypeCEInvoked && a.AuditType != AuditTypeCENotInvoked) {
		return
	}
	var info struct {
		Outcome *string `json:"outcome"`
	}
	if json.Unmarshal(a.AuditInformation, &info) == nil && info.Outcome != nil {
		outcome := NormalizeOutcome(*info.Outcome)
		a.Outcome = &outcome
	}
}
