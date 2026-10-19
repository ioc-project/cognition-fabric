// Package inbox keeps the Observe events pushed to the CE, found again by the exact trace and span of a submit.
package inbox

import (
	"crypto/sha256"
	"encoding/json"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/ids"
	"io"
	"net/http"
	"sync"
	"time"
)

type event struct {
	Type    string `json:"type"`
	Time    string `json:"time"`
	Session struct {
		ID       string `json:"id"`
		Sequence int    `json:"sequence"`
	} `json:"session"`
	Source struct {
		Service string `json:"service_name"`
	} `json:"source"`
	Correlation struct {
		Trace string `json:"trace_id"`
		Span  string `json:"span_id"`
	} `json:"correlation"`
}
type entry struct {
	event    event
	raw      json.RawMessage
	digest   [32]byte
	received time.Time
}

// A pre-call model request carries the whole conversation, so an event is far larger than a topology
// event; the inbox is bounded in bytes as well as in count.
const (
	maxEventBytes = 1 << 20
	MaxInboxBytes = 64 << 20
)

// Inbox is a bounded, deduplicated, in-memory event store.
type Inbox struct {
	mu       sync.Mutex
	service  string
	capacity int
	entries  []entry
	bytes    int
}

// New returns an inbox that only accepts events of service (any service when empty).
func New(service string, capacity int) *Inbox {
	return &Inbox{service: service, capacity: capacity}
}
func (i *Inbox) Receive(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxEventBytes))
	if err != nil {
		http.Error(w, "event exceeds limit", 413)
		return
	}
	var e event
	if json.Unmarshal(raw, &e) != nil || e.Type == "" || e.Session.ID == "" || e.Session.Sequence < 1 || e.Source.Service == "" {
		http.Error(w, "invalid normalized event", 400)
		return
	}
	if _, err := time.Parse(time.RFC3339Nano, e.Time); err != nil {
		http.Error(w, "invalid time", 400)
		return
	}
	if (e.Correlation.Trace != "" || e.Correlation.Span != "") && (!ids.Valid(e.Correlation.Trace, 32) || !ids.Valid(e.Correlation.Span, 16)) {
		http.Error(w, "invalid correlation", 400)
		return
	}
	if i.service != "" && e.Source.Service != i.service {
		http.Error(w, "service out of scope", 403)
		return
	}
	var canonical any
	_ = json.Unmarshal(raw, &canonical)
	raw, _ = json.Marshal(canonical)
	digest := sha256.Sum256(raw)
	i.mu.Lock()
	defer i.mu.Unlock()
	i.prune(time.Now())
	for _, old := range i.entries {
		if old.digest == digest {
			w.WriteHeader(202)
			return
		}
	}
	for len(i.entries) > 0 && (len(i.entries) >= i.capacity || i.bytes+len(raw) > MaxInboxBytes) {
		i.drop()
	}
	i.entries = append(i.entries, entry{e, raw, digest, time.Now()})
	i.bytes += len(raw)
	w.WriteHeader(202)
}
func (i *Inbox) drop() {
	i.bytes -= len(i.entries[0].raw)
	i.entries = i.entries[1:]
}
func (i *Inbox) prune(now time.Time) {
	for len(i.entries) > 0 && now.Sub(i.entries[0].received) > 15*time.Minute {
		i.drop()
	}
}
func (i *Inbox) Lookup(trace, span string) []json.RawMessage {
	i.mu.Lock()
	defer i.mu.Unlock()
	i.prune(time.Now())
	out := []json.RawMessage{}
	for _, e := range i.entries {
		if e.event.Correlation.Trace == trace && e.event.Correlation.Span == span {
			out = append(out, append(json.RawMessage(nil), e.raw...))
		}
	}
	return out
}
func (i *Inbox) Inspect(w http.ResponseWriter, r *http.Request) {
	trace, span := r.URL.Query().Get("trace_id"), r.URL.Query().Get("span_id")
	if !ids.Valid(trace, 32) || !ids.Valid(span, 16) {
		http.Error(w, "exact trace/span pair required", 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"events": i.Lookup(trace, span), "durable": false, "used_for_authorization": false})
}

// Bytes is the size of the events held, bounded by MaxInboxBytes.
func (i *Inbox) Bytes() int {
	i.mu.Lock()
	defer i.mu.Unlock()
	return i.bytes
}
