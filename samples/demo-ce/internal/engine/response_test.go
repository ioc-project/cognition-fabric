// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package engine

import (
	"os"
	"testing"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

// diagnostics decodes the demo-ce.v1 details object of a response returned to
// CFN. It fails the test unless the response has the published wire shape:
// details present and the four deprecated top-level diagnostics omitted.
func diagnostics(t *testing.T, out *cev1.EvaluateResponse) *cev1.EvaluateResponse {
	t.Helper()
	if out == nil {
		t.Fatal("no response returned")
	}
	if out.DenialReason != nil || out.MissingContextCause != nil || out.ContextSufficiency != nil || len(out.ChecksRun) > 0 {
		t.Fatalf("deprecated wire diagnostics populated: %v", out)
	}
	if schema := out.GetDetails().GetFields()["schema"].GetStringValue(); schema != "demo-ce.v1" {
		t.Fatalf("details not published with schema demo-ce.v1: %v", out.GetDetails())
	}
	data, err := protojson.Marshal(out.Details)
	if err != nil {
		t.Fatal(err)
	}
	result := &cev1.EvaluateResponse{}
	if err := (protojson.UnmarshalOptions{DiscardUnknown: true}).Unmarshal(data, result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestPublishDetailsPreservesDecisionAndOmitsLegacyFields(t *testing.T) {
	out := &cev1.EvaluateResponse{
		Outcome: cev1.Decision_DECISION_DENY, Reason: "configured denial", TraceId: "request-trace", Timestamp: "timestamp",
		DenialReason:        cev1.DenialReason_DENIAL_REASON_MISSING_CONTEXT.Enum(),
		MissingContextCause: cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE.Enum(),
		ContextSufficiency:  cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_DEGRADED_ATOMIC.Enum(),
		ChecksRun:           []*cev1.CheckResult{{CheckId: "required-input", Passed: false, Reason: "not ready"}},
	}
	if err := publishDetails(out); err != nil {
		t.Fatal(err)
	}
	if out.DenialReason != nil || out.MissingContextCause != nil || out.ContextSufficiency != nil || len(out.ChecksRun) != 0 {
		t.Fatal("legacy wire diagnostics populated")
	}
	if out.Outcome != cev1.Decision_DECISION_DENY || out.Reason != "configured denial" || out.TraceId != "request-trace" || out.Timestamp != "timestamp" {
		t.Fatal("decision or metadata changed")
	}
	if out.Details.GetFields()["schema"].GetStringValue() != "demo-ce.v1" {
		t.Fatal("missing detail schema")
	}
	if diagnostics(t, out).GetMissingContextCause() != cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_RACE || diagnostics(t, out).ChecksRun[0].GetPassed() {
		t.Fatal("diagnostics changed")
	}
	data, err := os.ReadFile("testdata/legacy-ce.protoset")
	if err != nil {
		t.Fatal(err)
	}
	set := &descriptorpb.FileDescriptorSet{}
	if err := proto.Unmarshal(data, set); err != nil {
		t.Fatal(err)
	}
	files, err := protodesc.NewFiles(set)
	if err != nil {
		t.Fatal(err)
	}
	desc, err := files.FindDescriptorByName("ioc.ce.v1.EvaluateResponse")
	if err != nil {
		t.Fatal(err)
	}
	legacy := dynamicpb.NewMessage(desc.(protoreflect.MessageDescriptor))
	wire, err := proto.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err := proto.Unmarshal(wire, legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.Get(legacy.Descriptor().Fields().ByName("outcome")).Enum() != 2 || legacy.Get(legacy.Descriptor().Fields().ByName("reason")).String() != "configured denial" {
		t.Fatal("unchanged consumer lost demo decision")
	}
}
