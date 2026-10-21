package cfn

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestRegistrationSendsHealthURL(t *testing.T) {
	var posted map[string]any
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method+" "+r.URL.Path != "POST /api/cognition-engine" {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
			return
		}
		json.NewDecoder(r.Body).Decode(&posted)
		w.WriteHeader(201)
		w.Write([]byte(`{"ce_id":"ce-1"}`))
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000/healthz", Name: "poc-ce", Client: api.Client()}
	id, err := l.Register(context.Background())
	if err != nil || id != "ce-1" {
		t.Fatalf("register %s %v", id, err)
	}
	if posted["health_url"] != "http://poc-ce:18000/healthz" || posted["enforcing_url"] != "poc-ce:18001" {
		t.Fatalf("registration body %v", posted)
	}
}

func TestRegistrationConflictUpdatesEndpointAndHealthURL(t *testing.T) {
	var patched map[string]any
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /api/cognition-engine":
			w.WriteHeader(409)
			w.Write([]byte(`{"detail":{"existing_ce_id":"ce-1"}}`))
		case "PATCH /api/cognition-engine/ce-1":
			json.NewDecoder(r.Body).Decode(&patched)
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000/healthz", Name: "poc-ce", Client: api.Client()}
	id, err := l.Register(context.Background())
	if err != nil || id != "ce-1" {
		t.Fatalf("register %s %v", id, err)
	}
	if patched["enforcing_url"] != "poc-ce:18001" || patched["health_url"] != "http://poc-ce:18000/healthz" {
		t.Fatalf("patch body %v", patched)
	}
}

func TestHealthURL(t *testing.T) {
	for _, c := range []struct{ grpc, listen, want string }{
		{"policy-ce:18001", ":18000", "http://policy-ce:18000/healthz"},
		{"policy-ce:18001", "0.0.0.0:9000", "http://policy-ce:9000/healthz"},
		{"10.0.0.5:18001", ":18000", "http://10.0.0.5:18000/healthz"},
		{"[::1]:18001", ":18000", "http://[::1]:18000/healthz"},
	} {
		got, err := HealthURL(c.grpc, c.listen)
		if err != nil || got != c.want {
			t.Errorf("HealthURL(%q, %q) = %q, %v; want %q", c.grpc, c.listen, got, err, c.want)
		}
	}
	for _, c := range []struct{ grpc, listen string }{
		{"policy-ce", ":18000"},
		{":18001", ":18000"},
		{"policy-ce:18001", "18000"},
		{"policy-ce:18001", ""},
	} {
		if got, err := HealthURL(c.grpc, c.listen); err == nil {
			t.Errorf("HealthURL(%q, %q) = %q, want an error", c.grpc, c.listen, got)
		}
	}
}

// After it has registered the CE sends CFN nothing more: CFN probes health_url, there is no heartbeat.
func TestRunRegistersOnceAndThenSendsNothing(t *testing.T) {
	var registrations, others atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "GET /api/internal/diagnostics/health":
			w.WriteHeader(200)
		case "POST /api/cognition-engine":
			registrations.Add(1)
			w.WriteHeader(201)
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		default:
			others.Add(1)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000/healthz", Name: "poc-ce", Client: api.Client()}

	ctx, cancel := context.WithCancel(context.Background())
	var ready atomic.Bool
	done := make(chan struct{})
	go func() { defer close(done); l.Run(ctx, ready.Store) }()

	deadline := time.Now().Add(3 * time.Second)
	for !ready.Load() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !ready.Load() {
		t.Fatal("the CE did not become ready after CFN accepted its registration")
	}
	time.Sleep(1500 * time.Millisecond) // longer than the loop's one second tick
	if registrations.Load() != 1 || others.Load() != 0 {
		t.Fatalf("registrations=%d other requests=%d, want 1 and 0", registrations.Load(), others.Load())
	}
	cancel()
	<-done
	if ready.Load() {
		t.Fatal("the CE is still ready after shutdown")
	}
}

func TestRunWaitsForCFNBeforeRegistering(t *testing.T) {
	var healthy, registrations atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/internal/diagnostics/health":
			if healthy.Load() == 0 {
				w.WriteHeader(503)
				return
			}
			w.WriteHeader(200)
		case "/api/cognition-engine":
			registrations.Add(1)
			w.WriteHeader(201)
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000/healthz", Name: "poc-ce", Client: api.Client()}

	ctx, cancel := context.WithCancel(context.Background())
	var ready atomic.Bool
	done := make(chan struct{})
	go func() { defer close(done); l.Run(ctx, ready.Store) }()

	time.Sleep(300 * time.Millisecond)
	if registrations.Load() != 0 || ready.Load() {
		t.Fatalf("registered or became ready while CFN was unhealthy: registrations=%d", registrations.Load())
	}
	healthy.Store(1)
	deadline := time.Now().Add(3 * time.Second)
	for !ready.Load() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !ready.Load() || registrations.Load() != 1 {
		t.Fatalf("ready=%v registrations=%d after CFN became healthy", ready.Load(), registrations.Load())
	}
	cancel()
	<-done
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
