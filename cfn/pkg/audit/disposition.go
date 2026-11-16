// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/structpb"
)

const (
	DispositionAction  = "get_disposition"
	MaxIdentifierBytes = 256
	MaxReasonBytes     = 8 * 1024
	MaxChecks          = 50
	MaxCheckIDBytes    = 128
	MaxCEResponseBytes = 16 * 1024

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
	CEResponse         *CEResponse        `json:"ce_response,omitempty"`
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

// CEResponse captures selected legacy fields, metadata and arbitrary CE-owned
// details. Legacy per-check reasons and modified_action are excluded.
type CEResponse struct {
	DenialReason        string    `json:"denial_reason,omitempty"`
	MissingContextCause string    `json:"missing_context_cause,omitempty"`
	ContextSufficiency  string    `json:"context_sufficiency,omitempty"`
	Timestamp           string    `json:"timestamp,omitempty"`
	TraceID             string    `json:"trace_id,omitempty"`
	ChecksRun           []CECheck `json:"checks_run,omitempty"`
	// A validated JSON snapshot; never retain the mutable CE response object.
	Details json.RawMessage `json:"details,omitempty"`
}

// CaptureResponse copies selected legacy fields and snapshots CE-owned data.
// An error reports omitted optional
// details; callers must still persist the core event and preserve the disposition.
func (d *DispositionInformation) CaptureResponse(response *cev1.EvaluateResponse) error {
	d.Outcome = response.GetOutcome().String()
	d.Reason = response.GetReason()
	details := &CEResponse{}
	if response != nil && response.DenialReason != nil {
		details.DenialReason = response.GetDenialReason().String()
	}
	if response != nil && response.MissingContextCause != nil {
		details.MissingContextCause = response.GetMissingContextCause().String()
	}
	if response != nil && response.ContextSufficiency != nil {
		details.ContextSufficiency = response.GetContextSufficiency().String()
	}
	details.Timestamp = d.bounded("ce_response.timestamp", response.GetTimestamp(), MaxCEResponseBytes)
	details.TraceID = d.bounded("ce_response.trace_id", response.GetTraceId(), MaxIdentifierBytes)
	checks := response.GetChecksRun()
	if len(checks) > MaxChecks {
		d.markTruncated("ce_response.checks_run")
		checks = checks[:MaxChecks]
	}
	for _, check := range checks {
		details.ChecksRun = append(details.ChecksRun, CECheck{
			CheckID: d.bounded("ce_response.checks_run.check_id", check.GetCheckId(), MaxCheckIDBytes),
			Passed:  check.GetPassed(),
		})
	}
	var omissionErr error
	if specific := response.GetDetails(); specific != nil {
		encoded, err := protojson.Marshal(specific)
		if err == nil && containsNUL(specific) {
			err = errors.New("U+0000 in a details key or string is not supported by PostgreSQL jsonb")
		}
		if err != nil {
			d.markTruncated("ce_response.details")
			omissionErr = fmt.Errorf("ce_response.details omitted: %w", err)
		} else {
			details.Details = encoded
		}
	}
	bounded, err := d.boundCEResponse(details)
	d.CEResponse = bounded
	return errors.Join(omissionErr, err)
}

// Measure the enclosing JSON, including escaping and legacy diagnostics.
func (d *DispositionInformation) boundCEResponse(details *CEResponse) (*CEResponse, error) {
	var omissionErr error
	for {
		encoded, err := json.Marshal(details)
		if err != nil {
			omissionErr = fmt.Errorf("CE audit response encoding failed: %w", err)
			if len(details.Details) > 0 {
				details.Details = nil
				d.markTruncated("ce_response.details")
				continue
			}
			d.markTruncated("ce_response")
			return nil, omissionErr
		}
		if len(encoded) <= MaxCEResponseBytes {
			break
		}
		switch {
		case len(details.Details) > 0:
			details.Details = nil
			d.markTruncated("ce_response.details")
			omissionErr = errors.New("ce_response.details omitted: combined audit details exceed 16 KiB")
		case details.Timestamp != "":
			details.Timestamp = ""
			d.markTruncated("ce_response.timestamp")
		case details.TraceID != "":
			details.TraceID = ""
			d.markTruncated("ce_response.trace_id")
		case len(details.ChecksRun) > 0:
			details.ChecksRun = details.ChecksRun[:len(details.ChecksRun)-1]
			d.markTruncated("ce_response.checks_run")
		default:
			d.markTruncated("ce_response")
			return nil, errors.New("ce_response omitted: audit budget exhausted with no removable fields")
		}
	}
	if details.DenialReason != "" || details.MissingContextCause != "" || details.ContextSufficiency != "" ||
		details.Timestamp != "" || details.TraceID != "" || len(details.ChecksRun) > 0 || len(details.Details) > 0 {
		return details, omissionErr
	}
	return nil, omissionErr
}

// Inspect decoded strings, not JSON escape text: literal backslash-u0000 is valid.
func containsNUL(object *structpb.Struct) bool {
	for key, value := range object.GetFields() {
		if strings.ContainsRune(key, 0) || valueContainsNUL(value) {
			return true
		}
	}
	return false
}

func valueContainsNUL(value *structpb.Value) bool {
	switch kind := value.GetKind().(type) {
	case *structpb.Value_StringValue:
		return strings.ContainsRune(kind.StringValue, 0)
	case *structpb.Value_StructValue:
		return containsNUL(kind.StructValue)
	case *structpb.Value_ListValue:
		for _, entry := range kind.ListValue.GetValues() {
			if valueContainsNUL(entry) {
				return true
			}
		}
	}
	return false
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
