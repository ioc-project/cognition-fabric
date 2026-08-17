// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package casa provides a client for the CASA Cognition Engine.
package casa

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	httpclient "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/http"
)

// AuthorizeRequest is the request body for the CASA CE /authorize endpoint.
type AuthorizeRequest struct {
	Extra   map[string]any   `json:"extra,omitempty"`
	Payload AuthorizePayload `json:"payload"`
}

// AuthorizePayload contains the enforcement request details.
type AuthorizePayload struct {
	MASID              string `json:"mas_id"`
	SourceAgentID      string `json:"source_agent_id"`
	DestinationAgentID string `json:"destination_agent_id"`
	TraceID            string `json:"trace_id"`
}

// AuthorizeResponse is the response from the CASA CE /authorize endpoint.
type AuthorizeResponse struct {
	Action string `json:"action"` // "allow", "block", "modify"
	Modify *bool  `json:"modify,omitempty"`
}

// Client is an HTTP client for the CASA Cognition Engine.
type Client struct {
	httpClient *httpclient.Client
	baseURL    string
	endpoint   string
}

// New creates a new CASA CE client.
func New(baseURL, endpoint string, timeout time.Duration) *Client {
	return &Client{
		httpClient: httpclient.New(timeout),
		baseURL:    baseURL,
		endpoint:   endpoint,
	}
}

// Authorize calls the CASA CE /authorize endpoint.
func (c *Client) Authorize(ctx context.Context, req *AuthorizeRequest) (*AuthorizeResponse, error) {
	url := c.baseURL + c.endpoint

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json",
	}

	resp, err := c.httpClient.Post(ctx, url, body, headers)
	if err != nil {
		return nil, fmt.Errorf("failed to call CASA CE: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("CASA CE returned error: status=%d body=%s", resp.StatusCode, string(respBody))
	}

	var authResp AuthorizeResponse
	if err := json.Unmarshal(respBody, &authResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &authResp, nil
}
