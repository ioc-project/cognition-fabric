// Package cfn is the lifecycle of a CE in CFN: registration, conflict recovery by PATCH and heartbeat.
package cfn

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/httpjson"
)

// Lifecycle registers this CE with CFN and keeps it online. CFN is reached over REST.
type Lifecycle struct {
	Base, Address, Name, Version, Type string
	Client                             *http.Client
}

// Healthy reports whether CFN answers its own health endpoint. The lifecycle loop holds register and
// heartbeat until it does, so a CFN that is starting or restarting is one message, not an error per second.
func (l *Lifecycle) Healthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, l.Base+"/api/internal/diagnostics/health", nil)
	if err != nil {
		return false
	}
	resp, err := l.Client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (l *Lifecycle) Register(ctx context.Context) (string, error) {
	version := l.Version
	if version == "" {
		version = "reference-v1"
	}
	ceType := l.Type
	if ceType == "" {
		ceType = "CASA"
	}
	body := map[string]any{"name": l.Name, "version": version, "ce_type": ceType, "base_url": l.Address, "endpoint": "ioc.ce.v1.CognitionEngine", "mas_auto_associate": true}
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
		err := httpjson.Exchange(ctx, l.Client, "PATCH", l.Base+"/api/cognition-engine/"+url.PathEscape(id), map[string]string{"base_url": l.Address, "endpoint": "ioc.ce.v1.CognitionEngine"}, nil)
		return id, err
	}
	if result.ID == "" {
		return "", fmt.Errorf("registration without CE id")
	}
	return result.ID, nil
}
func (l *Lifecycle) Heartbeat(ctx context.Context, id string) error {
	return httpjson.Exchange(ctx, l.Client, "PUT", l.Base+"/api/cognition-engine/"+url.PathEscape(id)+"/heartbeat", map[string]string{}, nil)
}

// Run keeps the CE registered until ctx ends: once per second it checks CFN's health, registers when it has
// no id yet and sends a heartbeat otherwise. setReady is told whether the last step succeeded. A CFN that is
// starting or restarting is one "waiting" line and one "reachable again" line, not an error per second.
func (l *Lifecycle) Run(ctx context.Context, setReady func(bool)) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	id := ""
	waiting := false
	for {
		var err error
		healthy := l.Healthy(ctx)
		switch {
		case !healthy:
			err = errors.New("CFN is not healthy yet")
			if !waiting && ctx.Err() == nil {
				log.Printf("waiting for CFN at %s before registering or sending heartbeats", l.Base)
			}
			waiting = true
		case id == "":
			id, err = l.Register(ctx)
		default:
			err = l.Heartbeat(ctx, id)
		}
		if healthy && waiting {
			log.Printf("CFN reachable again")
			waiting = false
		}
		setReady(err == nil)
		if err != nil && healthy && ctx.Err() == nil {
			log.Printf("CE lifecycle unavailable: %v", err)
		}
		select {
		case <-ctx.Done():
			setReady(false)
			return
		case <-ticker.C:
		}
	}
}
