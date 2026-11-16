// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"encoding/json"
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"google.golang.org/protobuf/types/known/structpb"
)

func specific(t *testing.T, values map[string]any) *structpb.Struct {
	t.Helper()
	s, err := structpb.NewStruct(values)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestCaptureSpecificDetailsValidation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		values  map[string]any
		invalid bool
	}{
		{"nested", map[string]any{"items": []any{1.5, true, nil, map[string]any{"key": "value"}}}, false},
		{"empty", map[string]any{}, false},
		{"NaN", map[string]any{"number": math.NaN()}, true},
		{"positive infinity", map[string]any{"number": math.Inf(1)}, true},
		{"nested negative infinity", map[string]any{"list": []any{math.Inf(-1)}}, true},
		{"NUL value", map[string]any{"value": "before\x00after"}, true},
		{"NUL key", map[string]any{"before\x00after": "value"}, true},
		{"nested NUL", map[string]any{"list": []any{map[string]any{"value": "\x00"}}}, true},
		{"literal escape", map[string]any{`\u0000`: `\u0000`}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := &cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_DENY, Reason: "core reason", Details: specific(t, tc.values)}
			d := DispositionInformation{}
			err := d.CaptureResponse(r)
			if (err != nil) != tc.invalid {
				t.Fatalf("validation error = %v", err)
			}
			if tc.invalid && (d.CEResponse != nil || !slices.Contains(d.TruncatedFields, "ce_response.details")) {
				t.Fatal("invalid details were not omitted and marked")
			}
			if !tc.invalid && (d.CEResponse == nil || len(d.CEResponse.Details) == 0) {
				t.Fatal("valid details were lost")
			}
			if !tc.invalid {
				var captured map[string]any
				if err := json.Unmarshal(d.CEResponse.Details, &captured); err != nil || !reflect.DeepEqual(captured, tc.values) {
					t.Fatalf("details changed: %s %v", d.CEResponse.Details, err)
				}
			}
			encoded, err := d.Encode()
			if err != nil || !json.Valid(encoded) || d.Reason != "core reason" || d.Outcome != "DECISION_DENY" {
				t.Fatalf("core event lost: %s %v", encoded, err)
			}
		})
	}
}

func TestCaptureDetailsSnapshotAndPresence(t *testing.T) {
	r := &cev1.EvaluateResponse{Details: specific(t, map[string]any{"value": "original"}), DenialReason: cev1.DenialReason_DENIAL_REASON_UNSPECIFIED.Enum(), MissingContextCause: cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_UNSPECIFIED.Enum(), ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_UNSPECIFIED.Enum()}
	d := DispositionInformation{}
	if err := d.CaptureResponse(r); err != nil {
		t.Fatal(err)
	}
	r.Details.Fields["value"] = structpb.NewStringValue("mutated")
	if d.CEResponse.DenialReason != "DENIAL_REASON_UNSPECIFIED" || d.CEResponse.MissingContextCause != "MISSING_CONTEXT_CAUSE_UNSPECIFIED" || d.CEResponse.ContextSufficiency != "CONTEXT_SUFFICIENCY_UNSPECIFIED" || !strings.Contains(string(d.CEResponse.Details), "original") {
		t.Fatal("presence or snapshot lost")
	}
	if err := d.CaptureResponse(&cev1.EvaluateResponse{}); err != nil {
		t.Fatal(err)
	}
	if d.CEResponse != nil {
		t.Fatal("invented diagnostic defaults for an omitted legacy value")
	}
}

func TestCaptureResponseEnvelopeJSONName(t *testing.T) {
	for name, response := range map[string]*cev1.EvaluateResponse{
		"legacy CE": {
			Outcome: cev1.Decision_DECISION_DENY, Reason: "legacy denial", TraceId: "echoed-trace",
			DenialReason: cev1.DenialReason_DENIAL_REASON_DEVIATES_FROM_INTENT.Enum(),
			ChecksRun:    []*cev1.CheckResult{{CheckId: "legacy-check", Passed: false}},
		},
		"CE-owned data": {
			Outcome: cev1.Decision_DECISION_ALLOW, Reason: "allowed", TraceId: "echoed-trace",
			Details: specific(t, map[string]any{"arbitrary": []any{true, nil, "CE value"}}),
		},
	} {
		t.Run(name, func(t *testing.T) {
			info := DispositionInformation{}
			if err := info.CaptureResponse(response); err != nil {
				t.Fatal(err)
			}
			data, err := info.Encode()
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]json.RawMessage
			if err := json.Unmarshal(data, &payload); err != nil {
				t.Fatal(err)
			}
			if _, ok := payload["ce_details"]; ok {
				t.Fatalf("new record emitted the historical key: %s", data)
			}
			var captured CEResponse
			if err := json.Unmarshal(payload["ce_response"], &captured); err != nil {
				t.Fatalf("new response envelope missing: %s: %v", data, err)
			}
			if captured.TraceID != response.TraceId || (len(captured.Details) > 0) != (response.Details != nil) {
				t.Fatalf("response data changed: %s", data)
			}
			if name == "legacy CE" && (captured.DenialReason != "DENIAL_REASON_DEVIATES_FROM_INTENT" || len(captured.ChecksRun) != 1) {
				t.Fatalf("legacy CE fields lost during audit rename: %s", data)
			}
		})
	}
}

func TestCombinedDetailsBudget(t *testing.T) {
	for _, offset := range []int{-1, 0, 1} {
		t.Run(string(rune('b'+offset)), func(t *testing.T) {
			// Build the exact encoded envelope length, not the unescaped input length.
			raw, _ := json.Marshal(map[string]any{"value": ""})
			base, _ := json.Marshal(CEResponse{Timestamp: "keep", TraceID: "trace", Details: raw})
			payload := strings.Repeat("x", MaxCEResponseBytes-len(base)+offset)
			r := &cev1.EvaluateResponse{Timestamp: "keep", TraceId: "trace", Details: specific(t, map[string]any{"value": payload})}
			d := DispositionInformation{}
			err := d.CaptureResponse(r)
			if (err != nil) != (offset > 0) {
				t.Fatalf("unexpected budget result: %v", err)
			}
			if d.CEResponse.Timestamp != "keep" || d.CEResponse.TraceID != "trace" {
				t.Fatal("legacy metadata dropped before new details")
			}
			encoded, _ := json.Marshal(d.CEResponse)
			if len(encoded) > MaxCEResponseBytes {
				t.Fatal("budget exceeded")
			}
			if (len(d.CEResponse.Details) == 0) != (offset > 0) {
				t.Fatal("incorrect details omission")
			}
		})
	}
	for _, checks := range [][]*cev1.CheckResult{nil, {}, {{CheckId: "keep", Passed: true}}} {
		d := DispositionInformation{}
		err := d.CaptureResponse(&cev1.EvaluateResponse{Timestamp: "keep", ChecksRun: checks, Details: specific(t, map[string]any{"value": strings.Repeat("\x01", MaxCEResponseBytes)})})
		if err == nil || d.CEResponse.Timestamp != "keep" || len(d.CEResponse.ChecksRun) != len(checks) {
			t.Fatal("empty/checks trimming or escaping regression")
		}
	}
}

func TestBudgetEncodingFailureAndTerminalFallback(t *testing.T) {
	d := DispositionInformation{}
	got, err := d.boundCEResponse(&CEResponse{Timestamp: "keep", Details: json.RawMessage(`{`)})
	if err == nil || got == nil || got.Timestamp != "keep" || len(got.Details) != 0 {
		t.Fatal("encoding error accepted as zero bytes")
	}
	got, err = d.boundCEResponse(&CEResponse{DenialReason: strings.Repeat("x", MaxCEResponseBytes+1)})
	if err == nil || got != nil || !slices.Contains(d.TruncatedFields, "ce_response") {
		t.Fatal("terminal fallback did not omit optional envelope")
	}
}
