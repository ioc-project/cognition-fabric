// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"encoding/json"
	"unicode/utf8"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

const (
	DispositionAction  = "get_disposition"
	MaxIdentifierBytes = 256
	MaxReasonBytes     = 8 * 1024
	MaxChecks          = 50
	MaxCheckIDBytes    = 128
	MaxCEDetailsBytes  = 16 * 1024

	FailureInvalidRequest        = "INVALID_REQUEST"
	FailureConfiguration         = "CFN_CONFIGURATION_ERROR"
	FailureMASNotFound           = "MAS_NOT_FOUND"
	FailureManagementLookup      = "MANAGEMENT_LOOKUP_FAILED"
	FailureNoAssociatedCE        = "NO_ASSOCIATED_CE"
	FailureCEDisabled            = "CE_DISABLED"
	FailureCEOffline             = "CE_OFFLINE"
	FailureCENoEnforcingEndpoint = "CE_NO_ENFORCING_ENDPOINT"
	FailureNoEligibleCE          = "NO_ELIGIBLE_CE"
	FailureCEConnection          = "CE_CONNECTION_FAILED"
	FailureCEEvaluation          = "CE_EVALUATION_FAILED"
)

// DispositionInformation is CFN's payload, not a schema imposed on other producers.
type DispositionInformation struct {
	Action             string             `json:"action"`
	MASID              string             `json:"mas_id"`
	SourceAgentID      string             `json:"source_agent_id"`
	DestinationAgentID string             `json:"destination_agent_id"`
	TraceID            string             `json:"trace_id"`
	SpanID             string             `json:"span_id"`
	CEName             string             `json:"ce_name,omitempty"`
	CEVersion          string             `json:"ce_version,omitempty"`
	CEInvoked          bool               `json:"ce_invoked"`
	Outcome            string             `json:"outcome"`
	Reason             string             `json:"reason"`
	GRPCStatus         string             `json:"grpc_status"`
	ReturnedAction     *string            `json:"returned_action,omitempty"`
	ReturnedModify     *bool              `json:"returned_modify,omitempty"`
	FailureCategory    string             `json:"failure_category,omitempty"`
	EligibilityCounts  *EligibilityCounts `json:"eligibility_counts,omitempty"`
	CEDetails          *CEDetails         `json:"ce_details,omitempty"`
	TruncatedFields    []string           `json:"truncated_fields,omitempty"`
}

// EligibilityCounts records the first exclusion reason for each candidate.
type EligibilityCounts struct {
	Disabled            int `json:"disabled"`
	Offline             int `json:"offline"`
	NoEnforcingEndpoint int `json:"no_enforcing_endpoint"`
}

type CECheck struct {
	CheckID string `json:"check_id"`
	Passed  bool   `json:"passed"`
}

// CEDetails deliberately excludes modified_action and per-check reasons.
type CEDetails struct {
	DenialReason        string    `json:"denial_reason,omitempty"`
	MissingContextCause string    `json:"missing_context_cause,omitempty"`
	ContextSufficiency  string    `json:"context_sufficiency,omitempty"`
	Timestamp           string    `json:"timestamp,omitempty"`
	TraceID             string    `json:"trace_id,omitempty"`
	ChecksRun           []CECheck `json:"checks_run,omitempty"`
}

// CaptureResponse copies only allowlisted existing response fields.
func (d *DispositionInformation) CaptureResponse(response *cev1.EvaluateResponse) {
	d.Outcome = response.GetOutcome().String()
	d.Reason = response.GetReason()
	details := &CEDetails{}
	if response.GetDenialReason() != cev1.DenialReason_DENIAL_REASON_UNSPECIFIED {
		details.DenialReason = response.GetDenialReason().String()
	}
	if response.GetMissingContextCause() != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_UNSPECIFIED {
		details.MissingContextCause = response.GetMissingContextCause().String()
	}
	if response.GetContextSufficiency() != cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_UNSPECIFIED {
		details.ContextSufficiency = response.GetContextSufficiency().String()
	}
	details.Timestamp = d.bounded("ce_details.timestamp", response.GetTimestamp(), MaxCEDetailsBytes)
	details.TraceID = d.bounded("ce_details.trace_id", response.GetTraceId(), MaxIdentifierBytes)
	checks := response.GetChecksRun()
	if len(checks) > MaxChecks {
		d.markTruncated("ce_details.checks_run")
		checks = checks[:MaxChecks]
	}
	for _, check := range checks {
		details.ChecksRun = append(details.ChecksRun, CECheck{
			CheckID: d.bounded("ce_details.checks_run.check_id", check.GetCheckId(), MaxCheckIDBytes),
			Passed:  check.GetPassed(),
		})
	}
	// Measure encoded JSON: escaping can use more bytes than the original text.
	for {
		encoded, _ := json.Marshal(details)
		if len(encoded) <= MaxCEDetailsBytes {
			break
		}
		switch {
		case details.Timestamp != "":
			details.Timestamp = ""
			d.markTruncated("ce_details.timestamp")
		case details.TraceID != "":
			details.TraceID = ""
			d.markTruncated("ce_details.trace_id")
		default:
			details.ChecksRun = details.ChecksRun[:len(details.ChecksRun)-1]
			d.markTruncated("ce_details.checks_run")
		}
	}
	if details.DenialReason != "" || details.MissingContextCause != "" || details.ContextSufficiency != "" ||
		details.Timestamp != "" || details.TraceID != "" || len(details.ChecksRun) > 0 {
		d.CEDetails = details
	}
}

// Encode bounds newly captured text once, before persistence; reads keep stored data.
func (d DispositionInformation) Encode() ([]byte, error) {
	d.TruncatedFields = append([]string(nil), d.TruncatedFields...)
	d.MASID = d.bounded("mas_id", d.MASID, MaxIdentifierBytes)
	d.SourceAgentID = d.bounded("source_agent_id", d.SourceAgentID, MaxIdentifierBytes)
	d.DestinationAgentID = d.bounded("destination_agent_id", d.DestinationAgentID, MaxIdentifierBytes)
	d.TraceID = d.bounded("trace_id", d.TraceID, MaxIdentifierBytes)
	d.SpanID = d.bounded("span_id", d.SpanID, MaxIdentifierBytes)
	d.Reason = d.bounded("reason", d.Reason, MaxReasonBytes)
	return json.Marshal(d)
}

func (d *DispositionInformation) bounded(field, value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	end := limit
	for end > 0 && !utf8.RuneStart(value[end]) {
		end--
	}
	d.markTruncated(field)
	return value[:end]
}

func (d *DispositionInformation) markTruncated(field string) {
	for _, existing := range d.TruncatedFields {
		if existing == field {
			return
		}
	}
	d.TruncatedFields = append(d.TruncatedFields, field)
}
