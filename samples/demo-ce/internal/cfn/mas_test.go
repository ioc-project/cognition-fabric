package cfn

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSyncAssociatedFetchesEachMAS(t *testing.T) {
	var masGets atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/cognition-engine/ce-1/multi-agentic-systems":
			w.Write([]byte(`{"mas_ids":["mas-b","mas-a"]}`))
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/multi-agentic-systems/"):
			masGets.Add(1)
			id := strings.TrimPrefix(r.URL.Path, "/api/multi-agentic-systems/")
			if r.URL.Query().Get("metadata") != "true" {
				t.Errorf("missing metadata=true on %s", r.URL)
			}
			json.NewEncoder(w).Encode(map[string]any{"id": id, "name": id})
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client()}
	l.SyncAssociated(context.Background(), "ce-1")
	if masGets.Load() != 2 {
		t.Fatalf("MAS GETs=%d want 2", masGets.Load())
	}
	got := map[string]bool{}
	for _, id := range l.KnownMAS() {
		got[id] = true
	}
	if !got["mas-a"] || !got["mas-b"] {
		t.Fatalf("known=%v", l.KnownMAS())
	}
}

func TestSyncAssociatedRetriesDiscovery404(t *testing.T) {
	var attempts atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/cognition-engine/ce-1/multi-agentic-systems" {
			t.Errorf("unexpected %s", r.URL.Path)
			w.WriteHeader(404)
			return
		}
		if attempts.Add(1) == 1 {
			w.WriteHeader(404)
			w.Write([]byte(`{"error":"CE not yet in CFN config"}`))
			return
		}
		w.Write([]byte(`{"mas_ids":[]}`))
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client()}
	start := time.Now()
	l.SyncAssociated(context.Background(), "ce-1")
	if attempts.Load() != 2 {
		t.Fatalf("attempts=%d want 2", attempts.Load())
	}
	if time.Since(start) > 5*time.Second {
		t.Fatal("discovery retry took too long")
	}
	if len(l.KnownMAS()) != 0 {
		t.Fatalf("known=%v", l.KnownMAS())
	}
}

func TestFetchMAS404Drops(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client()}
	l.upsertMAS("mas-1", map[string]any{"id": "mas-1"})
	l.fetchMAS(context.Background(), "mas-1")
	if len(l.KnownMAS()) != 0 {
		t.Fatalf("known=%v want empty", l.KnownMAS())
	}
}

func TestDeletedNotificationDoesNotGet(t *testing.T) {
	var gets atomic.Int32
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gets.Add(1)
		w.WriteHeader(500)
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client()}
	l.upsertMAS("mas-1", map[string]any{"id": "mas-1"})
	l.ApplyNotification(context.Background(), "mas.deleted", "mas-1")
	if gets.Load() != 0 {
		t.Fatalf("GETs=%d want 0", gets.Load())
	}
	if len(l.KnownMAS()) != 0 {
		t.Fatalf("known=%v", l.KnownMAS())
	}
}

func TestNotificationHandlerReturnsBeforeFetch(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		json.NewEncoder(w).Encode(map[string]any{"id": "mas-1", "name": "slow"})
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client(), work: context.Background()}
	req := httptest.NewRequest(http.MethodPost, "/notification", strings.NewReader(`{"event_type":"mas.created","mas_id":"mas-1"}`))
	w := httptest.NewRecorder()
	l.NotificationHandler(w, req)
	if w.Code != 200 {
		t.Fatalf("status=%d", w.Code)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("fetch did not start")
	}
	select {
	case <-release:
		t.Fatal("handler waited for fetch")
	default:
	}
	close(release)
	deadline := time.Now().Add(2 * time.Second)
	for len(l.KnownMAS()) == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if len(l.KnownMAS()) != 1 {
		t.Fatalf("known=%v", l.KnownMAS())
	}
}

func TestWorkflowRegisterDiscoverNotify(t *testing.T) {
	var disc atomic.Int32
	var mu sync.Mutex
	var masGets []string
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/cognition-engine":
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"ce_id":"ce-1"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/api/cognition-engine/ce-1/multi-agentic-systems":
			if disc.Add(1) == 1 {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error":"CE not yet in CFN config"}`))
				return
			}
			w.Write([]byte(`{"mas_ids":["mas-1"]}`))
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/multi-agentic-systems/"):
			id := strings.TrimPrefix(r.URL.Path, "/api/multi-agentic-systems/")
			mu.Lock()
			masGets = append(masGets, id+"?"+r.URL.RawQuery)
			mu.Unlock()
			if id == "mas-2" {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"id": id, "name": "Trip", "workspace_id": "ws"})
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer api.Close()

	l := Lifecycle{Base: api.URL, Address: "poc-ce:18001", HealthURL: "http://poc-ce:18000", Client: api.Client()}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var ready atomic.Bool
	done := make(chan struct{})
	go func() { defer close(done); l.Run(ctx, ready.Store) }()

	deadline := time.Now().Add(5 * time.Second)
	for (!ready.Load() || len(l.KnownMAS()) == 0) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if !ready.Load() {
		t.Fatal("did not register")
	}
	if got := l.KnownMAS(); len(got) != 1 || got[0] != "mas-1" {
		t.Fatalf("after discovery known=%v", got)
	}
	if disc.Load() < 2 {
		t.Fatalf("discovery attempts=%d want at least 2", disc.Load())
	}
	mu.Lock()
	if len(masGets) != 1 || masGets[0] != "mas-1?metadata=true" {
		t.Fatalf("initial MAS GETs=%v", masGets)
	}
	mu.Unlock()

	req := httptest.NewRequest(http.MethodPost, "/notification", strings.NewReader(`{"event_type":"mas.updated","mas_id":"mas-1"}`))
	w := httptest.NewRecorder()
	l.NotificationHandler(w, req)
	if w.Code != 200 {
		t.Fatalf("update ack=%d", w.Code)
	}
	deadline = time.Now().Add(2 * time.Second)
	for {
		mu.Lock()
		n := len(masGets)
		mu.Unlock()
		if n >= 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("update did not GET MAS, gets=%v", masGets)
		}
		time.Sleep(10 * time.Millisecond)
	}

	req = httptest.NewRequest(http.MethodPost, "/notification", strings.NewReader(`{"event_type":"mas.deleted","mas_id":"mas-1"}`))
	w = httptest.NewRecorder()
	l.NotificationHandler(w, req)
	deadline = time.Now().Add(time.Second)
	for len(l.KnownMAS()) != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if len(l.KnownMAS()) != 0 {
		t.Fatalf("after delete known=%v", l.KnownMAS())
	}
	mu.Lock()
	afterDelete := len(masGets)
	mu.Unlock()
	if afterDelete != 2 {
		t.Fatalf("delete must not GET, MAS GETs=%v", masGets)
	}

	req = httptest.NewRequest(http.MethodPost, "/notification", strings.NewReader(`{"event_type":"mas.updated","mas_id":"mas-2"}`))
	w = httptest.NewRecorder()
	l.NotificationHandler(w, req)
	deadline = time.Now().Add(2 * time.Second)
	for {
		mu.Lock()
		n := len(masGets)
		mu.Unlock()
		if n >= 3 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("mas-2 GET missing, gets=%v", masGets)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(l.KnownMAS()) != 0 {
		t.Fatalf("GET 404 should drop mas-2, known=%v", l.KnownMAS())
	}

	cancel()
	<-done
}

func TestCreatedNotificationFetches(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		json.NewEncoder(w).Encode(map[string]any{"id": "mas-1", "name": "Trip"})
	}))
	defer api.Close()
	l := Lifecycle{Base: api.URL, Client: api.Client()}
	l.ApplyNotification(context.Background(), "mas.created", "mas-1")
	if len(l.KnownMAS()) != 1 {
		t.Fatalf("known=%v", l.KnownMAS())
	}
}
