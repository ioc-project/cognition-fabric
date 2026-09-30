// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package mgmt provides a client for the CF Management Plane.
package mgmt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	httpclient "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/client/http"
)

// Note: The management plane API requires authentication in production.
// For now, we rely on the service-to-service trust within the cluster.

// MASResponse represents a Multi-Agentic System from the management plane.
type MASResponse struct {
	ID               string               `json:"id"`
	WorkspaceID      string               `json:"workspace_id"`
	Name             string               `json:"name"`
	CognitionEngines []MASCognitionEngine `json:"cognition_engines"`
}

// MASCognitionEngine represents a CE associated with a MAS.
type MASCognitionEngine struct {
	CEID     string `json:"ce_id"`
	CEType   string `json:"ce_type"`
	BaseURL  string `json:"base_url"`
	Endpoint string `json:"endpoint"`
	Enabled  bool   `json:"enabled"`
	Status   string `json:"status"`
}

// ErrNotFound is returned when a resource is not found.
var ErrNotFound = fmt.Errorf("not found")

// Client is an HTTP client for the CF Management Plane.
type Client struct {
	httpClient *httpclient.Client
	baseURL    string
}

// New creates a new management plane client.
func New(baseURL string, timeout time.Duration) *Client {
	return &Client{
		httpClient: httpclient.New(timeout),
		baseURL:    baseURL,
	}
}

// GetMAS fetches a MAS by workspace ID and MAS ID.
func (c *Client) GetMAS(ctx context.Context, workspaceID, masID string) (*MASResponse, error) {
	url := fmt.Sprintf("%s/api/workspaces/%s/multi-agentic-systems/%s", c.baseURL, workspaceID, masID)

	headers := map[string]string{
		"Accept": "application/json",
	}

	resp, err := c.httpClient.Get(ctx, url, headers)
	if err != nil {
		return nil, fmt.Errorf("failed to call management plane: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("management plane returned error: status=%d body=%s", resp.StatusCode, string(respBody))
	}

	var mas MASResponse
	if err := json.Unmarshal(respBody, &mas); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &mas, nil
}

// FindCASACEs returns all CASA CEs from a MAS response regardless of status.
func (m *MASResponse) FindCASACEs() []*MASCognitionEngine {
	var casaCEs []*MASCognitionEngine
	for i := range m.CognitionEngines {
		if m.CognitionEngines[i].CEType == "CASA" {
			casaCEs = append(casaCEs, &m.CognitionEngines[i])
		}
	}
	return casaCEs
}
