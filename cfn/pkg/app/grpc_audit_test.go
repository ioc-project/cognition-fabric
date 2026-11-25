// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	api "github.com/ioc-project/cognition-fabric/api/enforcement/v1"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/audit"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/client/database"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func appProxyFixture(t *testing.T, variant string) *api.AuditRecord {
	t.Helper()
	raw, err := os.ReadFile("../audit/testdata/proxy_" + variant + ".json")
	if err != nil {
		t.Fatal(err)
	}
	r := new(api.AuditRecord)
	if err := protojson.Unmarshal(raw, r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestValidateRequestEnvelopeBounds(t *testing.T) {
	for _, extra := range []int{0, 1} {
		t.Run(map[int]string{0: "at limit", 1: "over limit"}[extra], func(t *testing.T) {
			request := &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")}
			// Include unknown envelope fields: sizing only the record misses these bytes.
			overhead := protowire.SizeTag(999) + protowire.SizeVarint(uint64(audit.MaxProxyRequestBytes))
			padding := make([]byte, audit.MaxProxyRequestBytes-proto.Size(request)-overhead+extra)
			request.ProtoReflect().SetUnknown(protowire.AppendBytes(protowire.AppendTag(nil, 999, protowire.BytesType), padding))
			if size := proto.Size(request); size != audit.MaxProxyRequestBytes+extra {
				t.Fatalf("request size=%d", size)
			}
			err := validateRequest(request)
			if extra == 0 && err != nil {
				t.Fatalf("boundary request rejected: %v", err)
			}
			if extra == 1 && err == nil {
				t.Fatal("oversized envelope accepted")
			}
		})
	}
	if err := validateRequest(nil); err == nil {
		t.Fatal("nil request accepted")
	}
	if err := validateRequest(&api.AppendAuditRecordRequest{}); err == nil {
		t.Fatal("missing record accepted")
	}
}

func auditRPCClient(t *testing.T, store database.Store) api.EnforcementClient {
	t.Helper()
	listener := bufconn.Listen(audit.ProxyTransportMaxBytes)
	server := grpc.NewServer(grpc.MaxRecvMsgSize(audit.ProxyTransportMaxBytes))
	api.RegisterEnforcementServer(server, newEnforcementServer(store))
	go server.Serve(listener)
	conn, err := grpc.NewClient("passthrough:///audit-test", grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(); server.Stop(); listener.Close() })
	return api.NewEnforcementClient(conn)
}

func TestAppendAuditRPCReceiptsAndPermanentErrors(t *testing.T) {
	store := database.NewMockDatabase()
	client := auditRPCClient(t, store)
	ctx := context.Background()
	record := appProxyFixture(t, "mediation")
	for i := 0; i < 2; i++ {
		receipt, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: record})
		if err != nil || receipt.GetAuditRecordId() != record.AuditRecordId {
			t.Fatalf("receipt=%v err=%v", receipt, err)
		}
	}
	record.Route = "/conflict"
	if _, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: record}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("conflicting retry: %v", err)
	}
	record = appProxyFixture(t, "mediation")
	record.Extra = map[string]string{"key": "nul\x00value"}
	if _, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: record}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("JSONB storage rejection must be permanent: %v", err)
	}
	record = appProxyFixture(t, "mediation")
	record.SubmittedForm.Body = make([]byte, audit.MaxProxyFormBytes+1)
	if _, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: record}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("body limit must be permanent: %v", err)
	}
	record = appProxyFixture(t, "mediation")
	record.Route = strings.Repeat("x", audit.MaxProxyRequestBytes)
	if _, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: record}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("request limit must be permanent: %v", err)
	}
	request := &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")}
	request.ProtoReflect().SetUnknown(protowire.AppendBytes(protowire.AppendTag(nil, 999, protowire.BytesType), make([]byte, audit.MaxProxyRequestBytes)))
	if _, err := client.AppendAuditRecord(ctx, request); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("unknown envelope size must be permanent: %v", err)
	}
	if _, err := client.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("missing record: %v", err)
	}
	result, err := store.ListAuditEvents(ctx, "", "", 0, 20)
	if err != nil || result.PageInfo.TotalElements != 1 {
		t.Fatalf("invalid requests or retries added rows: %+v %v", result, err)
	}
}

type appendControlledStore struct {
	*database.MockDatabase
	entered chan struct{}
	release chan struct{}
	err     error
}

type auditSQLStateError struct{ code string }

func (e auditSQLStateError) Error() string    { return "private database failure details" }
func (e auditSQLStateError) SQLState() string { return e.code }

func TestAuditStorageFailureClassification(t *testing.T) {
	cases := []struct {
		code string
		want codes.Code
	}{
		{"22001", codes.InvalidArgument}, // Text length violation.
		{"22021", codes.InvalidArgument}, // Invalid character encoding.
		{"22P05", codes.InvalidArgument}, // Untranslatable character.
		{"22003", codes.Internal},        // Numeric errors may be server expressions.
		{"22012", codes.Internal},        // Division by zero must not discard valid records.
		{"22023", codes.Internal},        // A server-side parameter may be invalid.
		{"22P02", codes.Internal},        // An internal cast/encoding bug remains a server error.
		{"22999", codes.Internal},        // Do not classify all of class 22 as caller errors.
		{"23505", codes.Internal},        // Unhandled integrity errors are not successful retries.
		{"08006", codes.Unavailable}, {"57P01", codes.Unavailable}, {"53300", codes.Unavailable},
	}
	for _, tc := range cases {
		t.Run(tc.code, func(t *testing.T) {
			failure := fmt.Errorf("append: %w", auditSQLStateError{code: tc.code})
			if got := auditStorageErrorCode(failure); got != tc.want {
				t.Fatalf("code=%v want=%v", got, tc.want)
			}
			store := &appendControlledStore{MockDatabase: database.NewMockDatabase(), err: failure}
			receipt, err := newEnforcementServer(store).AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")})
			if receipt != nil || status.Code(err) != tc.want {
				t.Fatalf("receipt=%v error=%v", receipt, err)
			}
			if strings.Contains(err.Error(), "private database") {
				t.Fatal("database details exposed in RPC error")
			}
		})
	}
}

func (s *appendControlledStore) AppendProxyAuditEvent(ctx context.Context, event *audit.Audit) error {
	if s.entered != nil {
		close(s.entered)
	}
	if s.release != nil {
		select {
		case <-s.release:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if s.err != nil {
		return s.err
	}
	return s.MockDatabase.AppendProxyAuditEvent(ctx, event)
}

func TestAppendWaitsForPersistenceAndPropagatesFailure(t *testing.T) {
	store := &appendControlledStore{MockDatabase: database.NewMockDatabase(), entered: make(chan struct{}), release: make(chan struct{})}
	server := newEnforcementServer(store)
	done := make(chan error, 1)
	record := appProxyFixture(t, "mediation")
	go func() {
		_, err := server.AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: record})
		done <- err
	}()
	<-store.entered
	select {
	case err := <-done:
		t.Fatalf("acknowledged before storage completed: %v", err)
	default:
	}
	close(store.release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	store = &appendControlledStore{MockDatabase: database.NewMockDatabase(), err: errors.New("storage failure")}
	_, err := newEnforcementServer(store).AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")})
	if status.Code(err) != codes.Internal {
		t.Fatalf("unexpected storage error: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = server.AppendAuditRecord(ctx, &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")})
	if status.Code(err) != codes.Canceled {
		t.Fatalf("cancellation: %v", err)
	}
	_, err = newEnforcementServer(nil).AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: appProxyFixture(t, "mediation")})
	if status.Code(err) != codes.Unavailable {
		t.Fatalf("missing storage: %v", err)
	}
}

func TestProxyRPCPostgresAndReadAPI(t *testing.T) {
	cfg := config.DatabaseFromEnv()
	cfg.Name = os.Getenv("POSTGRES_TEST_DB")
	if cfg.Name == "" {
		cfg.Name = "cfn_audit_test"
	}
	base, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		t.Skipf("no test PostgreSQL: %v", err)
	}
	schema := "rpc_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := base.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { base.Exec("DROP SCHEMA " + schema + " CASCADE"); sqlDB, _ := base.DB(); sqlDB.Close() })
	gdb, err := gorm.Open(postgres.Open(cfg.DSN()+" search_path="+schema), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	store := &database.Database{DB: gdb}
	t.Cleanup(func() { store.Close() })
	if err := store.MigrateUp(); err != nil {
		t.Fatal(err)
	}
	client := auditRPCClient(t, store)
	bad := appProxyFixture(t, "mediation")
	bad.Route = "nul\x00route"
	if _, err := client.AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: bad}); status.Code(err) != codes.InvalidArgument {
		t.Fatalf("JSONB-invalid request must fail permanently before PostgreSQL: %v", err)
	}
	for _, variant := range []string{"response", "authorization", "middleware_authorization", "middleware_response_observation", "mediation", "mediation"} {
		record := appProxyFixture(t, variant)
		receipt, err := client.AppendAuditRecord(context.Background(), &api.AppendAuditRecordRequest{Record: record})
		if err != nil || receipt.GetAuditRecordId() != record.AuditRecordId {
			t.Fatalf("RPC persistence: %v %v", receipt, err)
		}
	}
	a := &App{db: store}
	request := httptest.NewRequest(http.MethodGet, "/api/internal/mgmt/audit?audit_type=PROXY_MEDIATED&outcome=ALLOW", nil)
	response := httptest.NewRecorder()
	if _, err := a.listAuditEventsHandler(response, request); err != nil {
		t.Fatal(err)
	}
	var events audit.AuditListResponse
	if err := json.Unmarshal(response.Body.Bytes(), &events); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || events.PageInfo.TotalElements != 2 || len(events.Data) != 2 {
		t.Fatalf("filtered read API: %d %s", response.Code, response.Body.String())
	}
	got := events.Data[1]
	if got.Source != audit.SourceProxy || got.SourceRecordID != nil || got.Outcome == nil || *got.Outcome != audit.OutcomeAllow {
		t.Fatalf("public JSON changed: %+v", got)
	}
	if got.CreatedOn.After(time.Date(2026, 10, 29, 8, 0, 1, 0, time.UTC)) {
		t.Fatal("event time replaced with ingestion time")
	}
	if os.Getenv("CF_AUDIT_WORKSPACE_VERIFY") == "1" {
		verifyAuditWorkspaceReaders(t, store)
	}
}
