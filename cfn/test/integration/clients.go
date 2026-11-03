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
	"time"

	enforcementv1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/cisco-eti/ioc-scale-cfn-svc/pkg/config"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
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
