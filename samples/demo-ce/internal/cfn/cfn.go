// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package cfn is the lifecycle of a CE in CFN: registration and conflict recovery by PATCH. CFN checks that
// the CE is alive by probing the health_url it declares.
package cfn

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/httpjson"
)

// Lifecycle registers this CE with CFN. CFN is reached over REST. HealthURL is the base URL CFN probes with a GET on /healthz
// to check the CE is alive.
type Lifecycle struct {
	Base, Address, HealthURL, Name, Version, Type string
	Client                                        *http.Client
}

// HealthURL builds the URL CFN probes from the gRPC address, whose host CFN already uses to
// reach this CE, and the port the HTTP server listens on.
func HealthURL(advertisedGRPCAddress, httpListenAddress string) (string, error) {
	host, _, err := net.SplitHostPort(advertisedGRPCAddress)
	if err != nil || host == "" {
		return "", fmt.Errorf("advertised gRPC address %q must be host:port", advertisedGRPCAddress)
	}
	_, port, err := net.SplitHostPort(httpListenAddress)
	if err != nil || port == "" {
		return "", fmt.Errorf("HTTP listen address %q must be host:port or :port", httpListenAddress)
	}
	return "http://" + net.JoinHostPort(host, port), nil
}

func (l *Lifecycle) Register(ctx context.Context) (string, error) {
	version := l.Version
	if version == "" {
		version = "1.0.0"
	}
	ceType := l.Type
	if ceType == "" {
		ceType = "CASA"
	}
	body := map[string]any{"name": l.Name, "version": version, "ce_type": ceType, "enforcing_url": l.Address, "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": l.HealthURL, "health_endpoint": "/healthz", "mas_auto_associate": true}
	raw, _ := json.Marshal(body)
	r, err := http.NewRequestWithContext(ctx, "POST", l.Base+"/api/cognition-engine", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	r.Header.Set("Content-Type", "application/json")
	resp, err := l.Client.Do(r)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var result struct {
		ID       string `json:"ce_id"`
		Existing string `json:"existing_ce_id"`
		Detail   struct {
			Existing string `json:"existing_ce_id"`
		} `json:"detail"`
	}
	if resp.StatusCode != http.StatusConflict && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		return "", fmt.Errorf("registration HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 65536)).Decode(&result); err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusConflict {
		id := result.Detail.Existing
		if id == "" {
			id = result.Existing
		}
		if id == "" {
			return "", fmt.Errorf("conflict without CE id")
		}
		err := httpjson.Exchange(ctx, l.Client, "PATCH", l.Base+"/api/cognition-engine/"+url.PathEscape(id), map[string]string{"enforcing_url": l.Address, "enforcing_endpoint": "ioc.ce.v1.CognitionEngine", "health_url": l.HealthURL, "health_endpoint": "/healthz"}, nil)
		return id, err
	}
	if result.ID == "" {
		return "", fmt.Errorf("registration without CE id")
	}
	return result.ID, nil
}

// Run attempts registration immediately and retries once per second until it succeeds,
// then waits for ctx to end: CFN probes health_url from then on, so there is nothing more to send.
// setReady is told whether the CE is registered.
func (l *Lifecycle) Run(ctx context.Context, setReady func(bool)) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		id, err := l.Register(ctx)
		if err == nil {
			slog.InfoContext(ctx, "Demo CE registered; CFN will probe its health endpoint", "event", "cfn.registered", "stage", "CFN", "ce_id", id, "ce_name", l.Name)
			setReady(true)
			<-ctx.Done()
			setReady(false)
			return
		}
		if ctx.Err() == nil {
			slog.WarnContext(ctx, "CE registration unavailable; retrying", "event", "cfn.registration_failed", "stage", "CFN")
		}
		select {
		case <-ctx.Done():
			setReady(false)
			return
		case <-ticker.C:
		}
	}
}
