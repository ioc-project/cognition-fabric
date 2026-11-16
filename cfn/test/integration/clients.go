// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	enforcementv1 "github.com/cisco-eti/cognition-fabric/api/enforcement/v1"
	"github.com/cisco-eti/cognition-fabric/cfn/pkg/config"
	. "github.com/onsi/gomega"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/encoding/protojson"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

func cfnTry(method, path string, body any) (int, map[string]any, []byte, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, nil, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, proc.HTTPBaseURL()+path, rdr)
	if err != nil {
		return 0, nil, nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var decoded map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &decoded)
	}
	return resp.StatusCode, decoded, raw, nil
}

func cfnDo(method, path string, body any) (int, map[string]any, []byte) {
	code, decoded, raw, err := cfnTry(method, path, body)
	if err != nil {
		panic(err)
	}
	return code, decoded, raw
}

func casaRegisterBody() map[string]any {
	notifyURL := ce.HTTPURL()
	notifyPath := "/notification/mas-lifecycle"
	return map[string]any{
		"name":                  fixtureCASAName,
		"version":               fixtureCASAVersion,
		"ce_type":               "CASA",
		"enforcing_url":         ce.GRPCAddr(),
		"enforcing_endpoint":    "ioc.ce.v1.CognitionEngine",
		"enforcing_protocol":    "grpc",
		"health_url":            ce.HTTPURL(),
		"health_endpoint":       "/healthz",
		"health_protocol":       "http",
		"notification_url":      notifyURL,
		"notification_endpoint": notifyPath,
		"notification_protocol": "http",
		"mas_auto_associate":    true,
	}
}

func registerCASA() (string, map[string]any, int) {
	code, body, _ := cfnDo(http.MethodPost, "/api/cognition-engine", casaRegisterBody())
	ceID, _ := body["ce_id"].(string)
	return ceID, body, code
}

func getDisposition(masID string) (*enforcementv1.GetDispositionResponse, error) {
	return getDispositionWith(masID, "agent-src", "agent-dst", "trace-1", "span-1")
}

func getDispositionWith(masID, src, dst, traceID, spanID string) (*enforcementv1.GetDispositionResponse, error) {
	return getDispositionWithTimeout(15*time.Second, masID, src, dst, traceID, spanID)
}

func getDispositionWithTimeout(timeout time.Duration, masID, src, dst, traceID, spanID string) (*enforcementv1.GetDispositionResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	conn, err := grpc.DialContext(ctx, proc.GRPCAddr(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	client := enforcementv1.NewEnforcementClient(conn)
	return client.GetDisposition(ctx, &enforcementv1.GetDispositionRequest{
		Payload: &enforcementv1.GetDispositionPayload{
			MasId:              masID,
			SourceAgentId:      src,
			DestinationAgentId: dst,
			TraceId:            traceID,
			SpanId:             spanID,
		},
	})
}

func dialEnforcement(ctx context.Context) (*grpc.ClientConn, error) {
	return grpc.DialContext(ctx, proc.GRPCAddr(),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
}

func proxyAuditFixture(variant string) *enforcementv1.AuditRecord {
	raw, err := os.ReadFile(filepath.Join(moduleRoot(), "pkg/audit/testdata", "proxy_"+variant+".json"))
	Expect(err).NotTo(HaveOccurred())
	record := new(enforcementv1.AuditRecord)
	Expect(protojson.Unmarshal(raw, record)).To(Succeed())
	return record
}

func appendAuditRecord(record *enforcementv1.AuditRecord) (*enforcementv1.AppendAuditRecordResponse, error) {
	return appendAuditRecordRequest(&enforcementv1.AppendAuditRecordRequest{Record: record})
}

func appendAuditRecordRequest(req *enforcementv1.AppendAuditRecordRequest) (*enforcementv1.AppendAuditRecordResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, err := dialEnforcement(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	return enforcementv1.NewEnforcementClient(conn).AppendAuditRecord(ctx, req)
}

func listAuditEvents(query string) (int, map[string]any, []map[string]any) {
	code, body, _ := cfnDo(http.MethodGet, "/api/internal/mgmt/audit"+query, nil)
	data, _ := body["data"].([]any)
	rows := make([]map[string]any, 0, len(data))
	for _, item := range data {
		row, ok := item.(map[string]any)
		if ok {
			rows = append(rows, row)
		}
	}
	return code, body, rows
}

func findAuditByRecordID(rows []map[string]any, recordID string) map[string]any {
	for _, row := range rows {
		if mustString(nestedMap(row, "audit_information"), "audit_record_id") == recordID {
			return row
		}
	}
	return nil
}

func truncateAudits() error {
	db, err := gorm.Open(postgres.Open(config.DatabaseFromEnv().DSN()), &gorm.Config{
		Logger: logger.Discard,
	})
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	return db.Exec("TRUNCATE TABLE audits").Error
}

func mustString(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func nestedMap(m map[string]any, key string) map[string]any {
	v, _ := m[key].(map[string]any)
	return v
}
