package cfn

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRegistrationConflictUpdatesEndpoint(t *testing.T) {
	patched, beat := false, false
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /api/cognition-engine":
			w.WriteHeader(409)
			w.Write([]byte(`{"detail":{"existing_ce_id":"ce-1"}}`))
		case "PATCH /api/cognition-engine/ce-1":
			var b map[string]any
			json.NewDecoder(r.Body).Decode(&b)
			patched = b["base_url"] == "poc-ce:18001"
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		case "PUT /api/cognition-engine/ce-1/heartbeat":
			beat = true
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", Name: "poc-ce", Client: api.Client()}
	id, err := l.Register(context.Background())
	if err != nil || id != "ce-1" || !patched {
		t.Fatalf("register %s %v patched=%v", id, err, patched)
	}
	if err := l.Heartbeat(context.Background(), id); err != nil || !beat {
		t.Fatalf("heartbeat %v", err)
	}
}

// The published CF contract must preserve span_id, and DENY wins over allowlist order.

func TestLifecycleHealthFollowsCFNHealthEndpoint(t *testing.T) {
	status := http.StatusServiceUnavailable
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/internal/diagnostics/health" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		w.WriteHeader(status)
	}))
	defer server.Close()
	l := Lifecycle{Base: server.URL, Client: server.Client()}
	if l.Healthy(context.Background()) {
		t.Fatal("an unhealthy CFN was reported healthy")
	}
	status = http.StatusOK
	if !l.Healthy(context.Background()) {
		t.Fatal("a healthy CFN was reported unhealthy")
	}
	server.Close()
	if l.Healthy(context.Background()) {
		t.Fatal("an unreachable CFN was reported healthy")
	}
}
