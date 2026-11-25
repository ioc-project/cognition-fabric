// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"net"
	"os"
	"testing"
	"time"

	enforcementv1 "github.com/ioc-project/cognition-fabric/api/enforcement/v1"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/client/database"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

func TestGetDispositionWithFrozenLegacyServer(t *testing.T) {
	data, err := os.ReadFile("../../../api/ce/v1/testdata/legacy/ce.protoset")
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
	requestDesc, err := files.FindDescriptorByName("ioc.ce.v1.EvaluateRequest")
	if err != nil {
		t.Fatal(err)
	}
	responseDesc, err := files.FindDescriptorByName("ioc.ce.v1.EvaluateResponse")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		action enforcementv1.GetDispositionResponse_Action
		modify bool
	}{
		{"allow", enforcementv1.GetDispositionResponse_ACTION_ALLOW, false},
		{"deny", enforcementv1.GetDispositionResponse_ACTION_BLOCK, false},
		{"modify", enforcementv1.GetDispositionResponse_ACTION_MODIFY, true},
		{"unknown", enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED, false},
		{"defaults", enforcementv1.GetDispositionResponse_ACTION_UNSPECIFIED, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			server := grpc.NewServer()
			defer server.Stop()
			responseBytes, err := os.ReadFile("../../../api/ce/v1/testdata/legacy/" + tc.name + ".bin")
			if err != nil {
				t.Fatal(err)
			}
			server.RegisterService(&grpc.ServiceDesc{ServiceName: "ioc.ce.v1.CognitionEngine", HandlerType: (*interface{})(nil), Methods: []grpc.MethodDesc{{MethodName: "Evaluate", Handler: func(_ any, ctx context.Context, decode func(any) error, _ grpc.UnaryServerInterceptor) (any, error) {
				request := dynamicpb.NewMessage(requestDesc.(protoreflect.MessageDescriptor))
				if err := decode(request); err != nil {
					return nil, err
				}
				response := dynamicpb.NewMessage(responseDesc.(protoreflect.MessageDescriptor))
				if err := proto.Unmarshal(responseBytes, response); err != nil {
					return nil, err
				}
				return response, nil
			}}}}, struct{}{})
			go func() { _ = server.Serve(listener) }()
			mas := map[string]any{"id": "mas-123", "workspace_id": "ws-test-123", "cognition_engines": []map[string]any{{"ce_id": "legacy-ce", "ce_type": "CASA", "enabled": true, "status": "online", "enforcing_url": listener.Addr().String()}}}
			cleanup, _ := setupTestEnv(t, mas)
			defer cleanup()
			store := database.NewMockDatabase()
			handler := newEnforcementServer(store)
			got, err := handler.GetDisposition(context.Background(), &enforcementv1.GetDispositionRequest{Payload: &enforcementv1.GetDispositionPayload{MasId: "mas-123", SourceAgentId: "source", DestinationAgentId: "target", TraceId: "request-trace", SpanId: "request-span"}})
			if err != nil || got.GetAction() != tc.action || got.GetModify() != tc.modify {
				t.Fatalf("legacy disposition changed: %v %v", got, err)
			}
			if !handler.WaitTimeout(time.Second) {
				t.Fatal("legacy audit did not finish")
			}
			events, err := store.ListAuditEvents(context.Background(), "", "", 0, 10)
			if err != nil || len(events.Data) != 1 || !*events.Data[0].Success {
				t.Fatal("legacy core audit lost")
			}
		})
	}
}
