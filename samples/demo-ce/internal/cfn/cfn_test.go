// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000", Name: "poc-ce", Client: api.Client()}
	id, err := l.Register(context.Background())
	if err != nil || id != "ce-1" {
		t.Fatalf("register %s %v", id, err)
	}
	if posted["health_endpoint"] != "/healthz" || posted["health_url"] != "http://poc-ce:18000" || posted["enforcing_url"] != "poc-ce:18001" {
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
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000", Name: "poc-ce", Client: api.Client()}
	id, err := l.Register(context.Background())
	if err != nil || id != "ce-1" {
		t.Fatalf("register %s %v", id, err)
	}
	if patched["enforcing_url"] != "poc-ce:18001" || patched["health_url"] != "http://poc-ce:18000" {
		t.Fatalf("patch body %v", patched)
	}
}

func TestHealthURL(t *testing.T) {
	for _, c := range []struct{ grpc, listen, want string }{
		{"demo-ce:18001", ":18000", "http://demo-ce:18000"},
		{"demo-ce:18001", "0.0.0.0:9000", "http://demo-ce:9000"},
		{"10.0.0.5:18001", ":18000", "http://10.0.0.5:18000"},
		{"[::1]:18001", ":18000", "http://[::1]:18000"},
	} {
		got, err := HealthURL(c.grpc, c.listen)
		if err != nil || got != c.want {
			t.Errorf("HealthURL(%q, %q) = %q, %v; want %q", c.grpc, c.listen, got, err, c.want)
		}
	}
	for _, c := range []struct{ grpc, listen string }{
		{"demo-ce", ":18000"},
		{":18001", ":18000"},
		{"demo-ce:18001", "18000"},
		{"demo-ce:18001", ""},
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
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000", Name: "poc-ce", Client: api.Client()}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
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

func TestRunRetriesRegistrationUntilAccepted(t *testing.T) {
	var registrations, others atomic.Int32
	var accepting atomic.Bool
	firstAttempt := make(chan struct{})
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.URL.Path {
		case "POST /api/cognition-engine":
			attempt := registrations.Add(1)
			if !accepting.Load() {
				w.WriteHeader(503)
				if attempt == 1 {
					close(firstAttempt)
				}
				return
			}
			w.WriteHeader(201)
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		default:
			others.Add(1)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000", Name: "poc-ce", Client: api.Client()}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var ready atomic.Bool
	done := make(chan struct{})
	go func() { defer close(done); l.Run(ctx, ready.Store) }()

	select {
	case <-firstAttempt:
	case <-time.After(time.Second):
		t.Fatal("the CE did not attempt registration immediately")
	}
	if ready.Load() {
		t.Fatal("the CE became ready before CFN accepted its registration")
	}
	accepting.Store(true)
	deadline := time.Now().Add(3 * time.Second)
	for !ready.Load() && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if !ready.Load() || registrations.Load() < 2 || others.Load() != 0 {
		t.Fatalf("ready=%v registrations=%d other requests=%d after CFN accepted registration", ready.Load(), registrations.Load(), others.Load())
	}
	cancel()
	<-done
}
