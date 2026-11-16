// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"

	cev1 "github.com/cisco-eti/cognition-fabric/api/ce/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type mockCE struct {
	cev1.UnimplementedCognitionEngineServer

	mu           sync.Mutex
	grpcSrv      *grpc.Server
	grpcLis      net.Listener
	httpSrv      *httptest.Server
	healthStatus int
	outcome      cev1.Decision
	reason       string
	evalErr      error
	lastEval     *cev1.EvaluateRequest
	lastNotify   map[string]any
	notifyCount  int
	notifyStatus int
}

func startMockCE() (*mockCE, error) {
	ce := &mockCE{
		healthStatus: http.StatusOK,
		outcome:      cev1.Decision_DECISION_ALLOW,
		reason:       "allow",
		notifyStatus: http.StatusOK,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		ce.mu.Lock()
		code := ce.healthStatus
		ce.mu.Unlock()
		w.WriteHeader(code)
	})
	mux.HandleFunc("/notification/mas-lifecycle", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		_ = json.Unmarshal(body, &payload)
		ce.mu.Lock()
		ce.lastNotify = payload
		ce.notifyCount++
		code := ce.notifyStatus
		ce.mu.Unlock()
		w.WriteHeader(code)
	})
	ce.httpSrv = httptest.NewServer(mux)

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		ce.httpSrv.Close()
		return nil, err
	}
	ce.grpcLis = lis
	ce.grpcSrv = grpc.NewServer()
	cev1.RegisterCognitionEngineServer(ce.grpcSrv, ce)
	go func() { _ = ce.grpcSrv.Serve(lis) }()
	return ce, nil
}

func (c *mockCE) Close() {
	if c.grpcSrv != nil {
		c.grpcSrv.GracefulStop()
	}
	if c.httpSrv != nil {
		c.httpSrv.Close()
	}
}

func (c *mockCE) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.healthStatus = http.StatusOK
	c.outcome = cev1.Decision_DECISION_ALLOW
	c.reason = "allow"
	c.evalErr = nil
	c.lastEval = nil
	c.lastNotify = nil
	c.notifyCount = 0
	c.notifyStatus = http.StatusOK
}

func (c *mockCE) GRPCAddr() string { return c.grpcLis.Addr().String() }

func (c *mockCE) Notifications() (int, map[string]any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	last := make(map[string]any, len(c.lastNotify))
	for key, value := range c.lastNotify {
		last[key] = value
	}
	return c.notifyCount, last
}

func (c *mockCE) HTTPURL() string { return c.httpSrv.URL }

func (c *mockCE) SetHealthStatus(code int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.healthStatus = code
}

func (c *mockCE) SetOutcome(outcome cev1.Decision, reason string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.outcome = outcome
	c.reason = reason
	c.evalErr = nil
}

func (c *mockCE) SetEvaluateError(err error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.evalErr = err
}

func (c *mockCE) LastEvaluate() *cev1.EvaluateRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lastEval
}

func (c *mockCE) Evaluate(_ context.Context, req *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastEval = req
	if c.evalErr != nil {
		return nil, c.evalErr
	}
	return &cev1.EvaluateResponse{
		Outcome: c.outcome,
		Reason:  c.reason,
	}, nil
}

func (c *mockCE) GetInfo(context.Context, *cev1.GetInfoRequest) (*cev1.GetInfoResponse, error) {
	return nil, status.Error(codes.Unimplemented, "GetInfo not used by CFN")
}
