// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package casa provides a gRPC client for the CASA Cognition Engine.
package casa

import (
	"context"
	"fmt"
	"time"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Client is a gRPC client for the CASA Cognition Engine.
type Client struct {
	conn    *grpc.ClientConn
	client  cev1.CognitionEngineClient
	target  string
	timeout time.Duration
}

// New creates a new CASA CE gRPC client.
// target is the gRPC address (e.g., "localhost:50051")
// serviceName is the gRPC service name (e.g., "ioc.ce.v1.CognitionEngine") - reserved for future use
func New(target, serviceName string, timeout time.Duration) *Client {
	return &Client{
		target:  target,
		timeout: timeout,
	}
}

// Connect establishes the gRPC connection.
func (c *Client) Connect(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	conn, err := grpc.DialContext(ctx, c.target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to CASA CE at %s: %w", c.target, err)
	}

	c.conn = conn
	c.client = cev1.NewCognitionEngineClient(conn)
	return nil
}

// Close closes the gRPC connection.
func (c *Client) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

// Evaluate calls the CASA CE Evaluate RPC.
func (c *Client) Evaluate(ctx context.Context, req *cev1.EvaluateRequest) (*cev1.EvaluateResponse, error) {
	if c.client == nil {
		return nil, fmt.Errorf("client not connected")
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	resp, err := c.client.Evaluate(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("CASA CE Evaluate failed: %w", err)
	}

	return resp, nil
}

// GetInfo calls the CASA CE GetInfo RPC.
func (c *Client) GetInfo(ctx context.Context) (*cev1.GetInfoResponse, error) {
	if c.client == nil {
		return nil, fmt.Errorf("client not connected")
	}

	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	resp, err := c.client.GetInfo(ctx, &cev1.GetInfoRequest{})
	if err != nil {
		return nil, fmt.Errorf("CASA CE GetInfo failed: %w", err)
	}

	return resp, nil
}
