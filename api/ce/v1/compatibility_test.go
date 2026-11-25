// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package cev1_test

import (
	"os"
	"testing"

	cev1 "github.com/ioc-project/cognition-fabric/api/ce/v1"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
	"google.golang.org/protobuf/types/known/structpb"
)

func legacyResponse(t *testing.T) *dynamicpb.Message {
	t.Helper()
	data, err := os.ReadFile("testdata/legacy/ce.protoset")
	if err != nil {
		t.Fatal(err)
	}
	set := &descriptorpb.FileDescriptorSet{}
	if err := proto.Unmarshal(data, set); err != nil {
		t.Fatal(err)
	}
	files, err := protodesc.NewFiles(set) // Private pool; never register duplicate global names.
	if err != nil {
		t.Fatal(err)
	}
	desc, err := files.FindDescriptorByName("ioc.ce.v1.EvaluateResponse")
	if err != nil {
		t.Fatal(err)
	}
	return dynamicpb.NewMessage(desc.(protoreflect.MessageDescriptor))
}

func TestLegacyBinaryResponses(t *testing.T) {
	for name, want := range map[string]cev1.Decision{"allow": 1, "deny": 2, "modify": 3, "unknown": 99, "defaults": 0} {
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile("testdata/legacy/" + name + ".bin")
			if err != nil {
				t.Fatal(err)
			}
			got := &cev1.EvaluateResponse{}
			if err := proto.Unmarshal(data, got); err != nil {
				t.Fatal(err)
			}
			if got.GetOutcome() != want || got.GetReason() != name+" from unchanged bindings" || got.Details != nil {
				t.Fatalf("legacy response changed: %v", got)
			}
			if name == "defaults" && (got.DenialReason != nil || got.MissingContextCause != nil || got.ContextSufficiency != nil) {
				t.Fatal("invented presence for omitted legacy defaults")
			}
			old := legacyResponse(t)
			if err := proto.Unmarshal(data, old); err != nil {
				t.Fatal(err)
			}
			roundTrip, err := proto.Marshal(got)
			if err != nil {
				t.Fatal(err)
			}
			decoded := dynamicpb.NewMessage(old.Descriptor())
			if err := proto.Unmarshal(roundTrip, decoded); err != nil {
				t.Fatal(err)
			}
			if !proto.Equal(old, decoded) {
				t.Fatal("legacy binary values changed on round trip")
			}
		})
	}
}

func TestLegacyConsumerIgnoresNewDetails(t *testing.T) {
	details, err := structpb.NewStruct(map[string]any{"schema": "test.v1", "items": []any{true, 12.5, nil, map[string]any{"text": "nested"}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, details := range []*structpb.Struct{nil, {}, details} {
		response := &cev1.EvaluateResponse{Outcome: cev1.Decision_DECISION_DENY, Reason: "neutral denial", Details: details, DenialReason: cev1.DenialReason_DENIAL_REASON_UNSPECIFIED.Enum(), MissingContextCause: cev1.MissingContextCause_MISSING_CONTEXT_CAUSE_UNSPECIFIED.Enum(), ContextSufficiency: cev1.ContextSufficiency_CONTEXT_SUFFICIENCY_UNSPECIFIED.Enum()}
		data, err := proto.Marshal(response)
		if err != nil {
			t.Fatal(err)
		}
		old := legacyResponse(t)
		if err := proto.Unmarshal(data, old); err != nil {
			t.Fatal(err)
		}
		if old.Get(old.Descriptor().Fields().ByName("outcome")).Enum() != 2 || old.Get(old.Descriptor().Fields().ByName("reason")).String() != "neutral denial" {
			t.Fatal("old consumer lost neutral decision")
		}
		if details != nil && len(old.GetUnknown()) == 0 {
			t.Fatal("new details not carried as an unknown legacy field")
		}
		// Old implicit-presence encoders omit an explicit default on reserialization.
		wire, err := proto.Marshal(old)
		if err != nil {
			t.Fatal(err)
		}
		updated := &cev1.EvaluateResponse{}
		if err := proto.Unmarshal(wire, updated); err != nil {
			t.Fatal(err)
		}
		if updated.DenialReason != nil || updated.MissingContextCause != nil || updated.ContextSufficiency != nil {
			t.Fatal("expected old default-presence loss")
		}
	}
}

func TestExistingDescriptorsPreserved(t *testing.T) {
	old := legacyResponse(t).Descriptor().ParentFile()
	current := (&cev1.EvaluateResponse{}).ProtoReflect().Descriptor().ParentFile()
	for i := 0; i < old.Enums().Len(); i++ {
		e := old.Enums().Get(i)
		if !proto.Equal(protodesc.ToEnumDescriptorProto(e), protodesc.ToEnumDescriptorProto(current.Enums().ByName(e.Name()))) {
			t.Fatalf("enum changed: %s", e.Name())
		}
	}
	for i := 0; i < old.Services().Len(); i++ {
		s := old.Services().Get(i)
		if !proto.Equal(protodesc.ToServiceDescriptorProto(s), protodesc.ToServiceDescriptorProto(current.Services().ByName(s.Name()))) {
			t.Fatalf("service changed: %s", s.Name())
		}
	}
	for i := 0; i < old.Messages().Len(); i++ {
		m := old.Messages().Get(i)
		if m.Name() != "EvaluateResponse" && !proto.Equal(protodesc.ToDescriptorProto(m), protodesc.ToDescriptorProto(current.Messages().ByName(m.Name()))) {
			t.Fatalf("message changed: %s", m.Name())
		}
	}
	fields := current.Messages().ByName("EvaluateResponse").Fields()
	for i := 0; i < old.Messages().ByName("EvaluateResponse").Fields().Len(); i++ {
		f := old.Messages().ByName("EvaluateResponse").Fields().Get(i)
		n := fields.ByNumber(f.Number())
		if n == nil || n.Name() != f.Name() || n.Kind() != f.Kind() || n.Cardinality() != f.Cardinality() {
			t.Fatalf("field contract changed: %s", f.Name())
		}
		if f.Kind() == protoreflect.EnumKind && n.Enum().FullName() != f.Enum().FullName() {
			t.Fatalf("enum field type changed: %s", f.Name())
		}
		if f.Kind() == protoreflect.MessageKind && n.Message().FullName() != f.Message().FullName() {
			t.Fatalf("message field type changed: %s", f.Name())
		}
	}
	for _, tag := range []protoreflect.FieldNumber{2, 3, 6} {
		if !fields.ByNumber(tag).HasPresence() {
			t.Fatalf("missing enum presence: %d", tag)
		}
	}
	for _, tag := range []protoreflect.FieldNumber{2, 3, 5, 6} {
		if !fields.ByNumber(tag).Options().(*descriptorpb.FieldOptions).GetDeprecated() {
			t.Fatalf("missing deprecation: %d", tag)
		}
	}
	if fields.ByNumber(10).Message().FullName() != "google.protobuf.Struct" {
		t.Fatal("details type/tag changed")
	}
}
