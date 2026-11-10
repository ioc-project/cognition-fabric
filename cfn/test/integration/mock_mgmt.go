// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

//go:build integration

package integration_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type mockEngine struct {
	ID                   string
	Name                 string
	Version              string
	CEType               string
	EnforcingURL         string
	EnforcingEndpoint    string
	EnforcingProtocol    string
	HealthURL            string
	HealthEndpoint       string
	HealthProtocol       string
	NotificationURL      string
	NotificationEndpoint string
	NotificationProtocol string
	Enabled              bool
	Status               string
	MASAutoAssociate     bool
}

type mockMgmt struct {
	mu            sync.Mutex
	server        *httptest.Server
	cfnID         string
	configVersion int64
	ids           fixtureIDs
	engines       map[string]*mockEngine
	byNameVer     map[string]string
	masGetStatus  int
	registerBody  string // "invalid-json" forces 201 with a non-JSON body
	lastRegister  map[string]any
	emptySnapshot bool
}

func startMockMgmt(ids fixtureIDs) *mockMgmt {
	m := &mockMgmt{
		cfnID:         uuid.NewString(),
		configVersion: 1,
		ids:           ids,
		engines:       map[string]*mockEngine{},
		byNameVer:     map[string]string{},
		masGetStatus:  http.StatusOK,
	}
	m.server = httptest.NewServer(http.HandlerFunc(m.serve))
	return m
}

func (m *mockMgmt) URL() string { return m.server.URL }

func (m *mockMgmt) Close() { m.server.Close() }

func (m *mockMgmt) Reset(ids fixtureIDs) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ids = ids
	m.engines = map[string]*mockEngine{}
	m.byNameVer = map[string]string{}
	m.masGetStatus = http.StatusOK
	m.registerBody = ""
	m.lastRegister = nil
	m.emptySnapshot = false
	m.configVersion++
}

func (m *mockMgmt) BumpConfigVersion() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.configVersion++
}

func (m *mockMgmt) ConfigVersion() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.configVersion
}

func (m *mockMgmt) SetMASGetStatus(code int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.masGetStatus = code
}

func (m *mockMgmt) FailNextRegisterJSON() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.registerBody = "invalid-json"
}

func (m *mockMgmt) SetEmptySnapshot(empty bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.emptySnapshot = empty
	m.configVersion++
}

func (m *mockMgmt) SetEngineStatus(ceID, status string, enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.engines[ceID]; ok {
		e.Status = status
		e.Enabled = enabled
	}
}

func (m *mockMgmt) SetEngineEnforcingURL(ceID, url string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.engines[ceID]; ok {
		e.EnforcingURL = url
	}
}

func (m *mockMgmt) LastRegister() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastRegister
}

func (m *mockMgmt) Engine(ceID string) *mockEngine {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.engines[ceID]
}

func (m *mockMgmt) serve(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/api/cognition-fabric-nodes/register":
		m.writeJSON(w, http.StatusOK, map[string]any{
			"id":     m.cfnID,
			"config": m.snapshotLocked(),
		})
	case r.Method == http.MethodPut && strings.HasSuffix(r.URL.Path, "/heartbeat"):
		m.mu.Lock()
		ver := m.configVersion
		m.mu.Unlock()
		m.writeJSON(w, http.StatusOK, map[string]any{
			"status":         "online",
			"last_seen":      time.Now().UTC().Format(time.RFC3339),
			"config_version": ver,
		})
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/cognition-fabric-nodes/") &&
		!strings.Contains(r.URL.Path, "heartbeat"):
		m.writeJSON(w, http.StatusOK, map[string]any{
			"id":     m.cfnID,
			"config": m.snapshotLocked(),
		})
	case r.Method == http.MethodPost && r.URL.Path == "/api/cognition-engines":
		m.handleRegister(w, r)
	case r.Method == http.MethodPatch && strings.HasPrefix(r.URL.Path, "/api/cognition-engines/"):
		m.handlePatch(w, r)
	case r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/cognition-engines/"):
		m.handleDelete(w, r)
	case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/multi-agentic-systems/"):
		m.handleGetMAS(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (m *mockMgmt) snapshotLocked() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshot()
}

func (m *mockMgmt) snapshot() map[string]any {
	if m.emptySnapshot {
		return map[string]any{
			"config_version":    m.configVersion,
			"cognition_engines": []any{},
			"workspaces":        []any{},
		}
	}
	engines := make([]map[string]any, 0, len(m.engines))
	masEngines := make([]map[string]any, 0, len(m.engines))
	for _, e := range m.engines {
		engines = append(engines, map[string]any{
			"id":                    e.ID,
			"ce_type":               e.CEType,
			"enforcing_url":         e.EnforcingURL,
			"enforcing_endpoint":    e.EnforcingEndpoint,
			"enforcing_protocol":    e.EnforcingProtocol,
			"health_url":            e.HealthURL,
			"health_endpoint":       e.HealthEndpoint,
			"health_protocol":       e.HealthProtocol,
			"notification_url":      e.NotificationURL,
			"notification_endpoint": e.NotificationEndpoint,
			"notification_protocol": e.NotificationProtocol,
			"enabled":               e.Enabled,
			"status":                e.Status,
			"mas_auto_associate":    e.MASAutoAssociate,
			"mas_config":            map[string]any{},
		})
		if e.MASAutoAssociate {
			masEngines = append(masEngines, map[string]any{
				"id":         e.ID,
				"ce_type":    e.CEType,
				"mas_config": map[string]any{},
			})
		}
	}
	return map[string]any{
		"config_version":    m.configVersion,
		"cognition_engines": engines,
		"workspaces": []map[string]any{{
			"workspace_id":   m.ids.workspaceID,
			"workspace_name": fixtureWorkspaceName,
			"multi_agentic_systems": []map[string]any{{
				"id":                m.ids.masID,
				"name":              fixtureMASName,
				"last_updated_on":   time.Now().UTC().Format(time.RFC3339),
				"cognition_engines": masEngines,
			}},
		}},
	}
}

func (m *mockMgmt) handleRegister(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	m.mu.Lock()
	if m.registerBody == "invalid-json" {
		m.registerBody = ""
		m.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("not-json"))
		return
	}
	var req map[string]any
	_ = json.Unmarshal(body, &req)
	m.lastRegister = req
	name, _ := req["name"].(string)
	version, _ := req["version"].(string)
	key := name + "/" + version
	if existing, ok := m.byNameVer[key]; ok {
		m.mu.Unlock()
		m.writeJSON(w, http.StatusConflict, map[string]any{
			"detail": map[string]any{
				"error":          "CE already exists",
				"existing_ce_id": existing,
			},
		})
		return
	}
	auto := true
	if v, ok := req["mas_auto_associate"].(bool); ok {
		auto = v
	}
	ceType, _ := req["ce_type"].(string)
	eng := &mockEngine{
		ID:                   uuid.NewString(),
		Name:                 name,
		Version:              version,
		CEType:               ceType,
		EnforcingURL:         stringField(req, "enforcing_url"),
		EnforcingEndpoint:    stringField(req, "enforcing_endpoint"),
		EnforcingProtocol:    stringFieldOr(req, "enforcing_protocol", "grpc"),
		HealthURL:            stringField(req, "health_url"),
		HealthEndpoint:       stringField(req, "health_endpoint"),
		HealthProtocol:       stringFieldOr(req, "health_protocol", "http"),
		NotificationURL:      stringField(req, "notification_url"),
		NotificationEndpoint: stringField(req, "notification_endpoint"),
		NotificationProtocol: stringFieldOr(req, "notification_protocol", "http"),
		Enabled:              true,
		Status:               "online",
		MASAutoAssociate:     auto,
	}
	m.engines[eng.ID] = eng
	m.byNameVer[key] = eng.ID
	m.configVersion++
	id := eng.ID
	cfnID := m.cfnID
	m.mu.Unlock()

	m.writeJSON(w, http.StatusCreated, map[string]any{
		"ce_id":                 id,
		"cfn_id":                cfnID,
		"name":                  name,
		"version":               version,
		"ce_type":               ceType,
		"enforcing_url":         eng.EnforcingURL,
		"enforcing_endpoint":    eng.EnforcingEndpoint,
		"enforcing_protocol":    eng.EnforcingProtocol,
		"health_url":            eng.HealthURL,
		"health_endpoint":       eng.HealthEndpoint,
		"health_protocol":       eng.HealthProtocol,
		"enabled":               true,
		"status":                "online",
		"mas_auto_associate":    auto,
		"notification_url":      eng.NotificationURL,
		"notification_endpoint": eng.NotificationEndpoint,
		"notification_protocol": eng.NotificationProtocol,
		"created":               true,
	})
}

func (m *mockMgmt) handlePatch(w http.ResponseWriter, r *http.Request) {
	ceID := strings.TrimPrefix(r.URL.Path, "/api/cognition-engines/")
	body, _ := io.ReadAll(r.Body)
	var req map[string]any
	_ = json.Unmarshal(body, &req)
	m.mu.Lock()
	eng, ok := m.engines[ceID]
	if !ok {
		m.mu.Unlock()
		m.writeJSON(w, http.StatusNotFound, map[string]any{"error": "CE not found"})
		return
	}
	if v, ok := req["enforcing_url"].(string); ok {
		eng.EnforcingURL = v
	}
	if v, ok := req["enforcing_endpoint"].(string); ok {
		eng.EnforcingEndpoint = v
	}
	if v, ok := req["health_url"].(string); ok {
		eng.HealthURL = v
	}
	if v, ok := req["health_endpoint"].(string); ok {
		eng.HealthEndpoint = v
	}
	m.configVersion++
	resp := map[string]any{
		"id":                 eng.ID,
		"ce_id":              eng.ID,
		"enforcing_url":      eng.EnforcingURL,
		"enforcing_endpoint": eng.EnforcingEndpoint,
		"health_url":         eng.HealthURL,
		"health_endpoint":    eng.HealthEndpoint,
	}
	m.mu.Unlock()
	m.writeJSON(w, http.StatusOK, resp)
}

func (m *mockMgmt) handleDelete(w http.ResponseWriter, r *http.Request) {
	ceID := strings.TrimPrefix(r.URL.Path, "/api/cognition-engines/")
	m.mu.Lock()
	eng, ok := m.engines[ceID]
	if !ok {
		m.mu.Unlock()
		m.writeJSON(w, http.StatusNotFound, map[string]any{"error": "CE not found"})
		return
	}
	delete(m.engines, ceID)
	delete(m.byNameVer, eng.Name+"/"+eng.Version)
	m.configVersion++
	m.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func (m *mockMgmt) handleGetMAS(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	masID := parts[len(parts)-1]
	m.mu.Lock()
	status := m.masGetStatus
	ids := m.ids
	engines := make([]map[string]any, 0, len(m.engines))
	for _, e := range m.engines {
		if !e.MASAutoAssociate {
			continue
		}
		engines = append(engines, map[string]any{
			"ce_id":              e.ID,
			"ce_type":            e.CEType,
			"enforcing_url":      e.EnforcingURL,
			"enforcing_endpoint": e.EnforcingEndpoint,
			"enforcing_protocol": e.EnforcingProtocol,
			"enabled":            e.Enabled,
			"status":             e.Status,
		})
	}
	m.mu.Unlock()
	if status != http.StatusOK {
		m.writeJSON(w, status, map[string]any{"error": "forced GetMAS status"})
		return
	}
	if masID != ids.masID {
		m.writeJSON(w, http.StatusNotFound, map[string]any{"error": "MAS not found"})
		return
	}
	m.writeJSON(w, http.StatusOK, map[string]any{
		"id":                ids.masID,
		"workspace_id":      ids.workspaceID,
		"name":              fixtureMASName,
		"cognition_engines": engines,
	})
}

func (m *mockMgmt) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func stringField(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

func stringFieldOr(m map[string]any, key, fallback string) string {
	if v, ok := m[key].(string); ok && v != "" {
		return v
	}
	return fallback
}
