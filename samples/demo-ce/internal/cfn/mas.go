package cfn

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

const (
	maxDelay     = 30 * time.Second
	initialDelay = 500 * time.Millisecond
)

func (l *Lifecycle) notifyURL() string {
	if l.NotificationURL != "" {
		return l.NotificationURL
	}
	return l.HealthURL
}

func (l *Lifecycle) ensureStore() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.mas == nil {
		l.mas = map[string]map[string]any{}
	}
	if l.gen == nil {
		l.gen = map[string]uint64{}
	}
}

func (l *Lifecycle) generation(masID string) uint64 {
	l.ensureStore()
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.gen[masID]
}

func (l *Lifecycle) KnownMAS() []string {
	l.ensureStore()
	l.mu.Lock()
	defer l.mu.Unlock()
	ids := make([]string, 0, len(l.mas))
	for id := range l.mas {
		ids = append(ids, id)
	}
	return ids
}

func (l *Lifecycle) dropMAS(masID string) {
	l.ensureStore()
	l.mu.Lock()
	l.gen[masID]++
	_, ok := l.mas[masID]
	delete(l.mas, masID)
	l.mu.Unlock()
	if ok {
		slog.Info("dropped associated MAS", "event", "mas.dropped", "stage", "CFN", "mas_id", masID)
	}
}

func (l *Lifecycle) upsertMAS(masID string, details map[string]any) {
	l.upsertMASIf(masID, details, 0, false)
}

func (l *Lifecycle) upsertMASIf(masID string, details map[string]any, gen uint64, check bool) {
	l.ensureStore()
	l.mu.Lock()
	if check && l.gen[masID] != gen {
		l.mu.Unlock()
		return
	}
	l.mas[masID] = details
	l.mu.Unlock()
	name, _ := details["name"].(string)
	ws, _ := details["workspace_id"].(string)
	slog.Info("associated MAS", "event", "mas.upserted", "stage", "CFN", "mas_id", masID, "name", name, "workspace_id", ws)
}

// NotificationHandler acks POST /notification immediately and applies the event in the background.
func (l *Lifecycle) NotificationHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		EventType string `json:"event_type"`
		MASID     string `json:"mas_id"`
		Timestamp string `json:"timestamp"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 65536)).Decode(&payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"received"}`))
	ctx := l.Work
	if ctx == nil {
		ctx = context.Background()
	}
	go l.ApplyNotification(ctx, payload.EventType, payload.MASID)
}

func (l *Lifecycle) ApplyNotification(ctx context.Context, eventType, masID string) {
	if masID == "" {
		return
	}
	switch eventType {
	case "mas.deleted":
		l.dropMAS(masID)
	case "mas.created", "mas.updated":
		l.fetchMAS(ctx, masID)
	default:
		slog.Warn("ignoring MAS notification", "event", "mas.ignored", "stage", "CFN", "event_type", eventType, "mas_id", masID)
	}
}

// SyncAssociated pulls associated MAS IDs until CFN returns 200, then GETs each MAS.
func (l *Lifecycle) SyncAssociated(ctx context.Context, ceID string) {
	ids, err := l.listAssociated(ctx, ceID)
	if err != nil {
		if ctx.Err() == nil {
			slog.Warn("associated MAS discovery stopped", "event", "mas.discovery_failed", "stage", "CFN", "ce_id", ceID)
		}
		return
	}
	slog.Info("initial MAS associations", "event", "mas.discovered", "stage", "CFN", "ce_id", ceID, "count", len(ids))
	for _, id := range ids {
		if ctx.Err() != nil {
			return
		}
		l.fetchMAS(ctx, id)
	}
}

func (l *Lifecycle) listAssociated(ctx context.Context, ceID string) ([]string, error) {
	delay := initialDelay
	path := l.Base + "/api/cognition-engine/" + url.PathEscape(ceID) + "/multi-agentic-systems"
	for {
		status, body, err := l.get(ctx, path)
		if err == nil && status == http.StatusOK {
			var parsed struct {
				MASIDs []string `json:"mas_ids"`
			}
			if err := json.Unmarshal(body, &parsed); err != nil {
				return nil, err
			}
			if parsed.MASIDs == nil {
				parsed.MASIDs = []string{}
			}
			return parsed.MASIDs, nil
		}
		if err == nil && status == http.StatusBadRequest {
			return nil, fmt.Errorf("discovery HTTP %d", status)
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
		if delay < maxDelay {
			delay *= 2
			if delay > maxDelay {
				delay = maxDelay
			}
		}
	}
}

func (l *Lifecycle) fetchMAS(ctx context.Context, masID string) {
	gen := l.generation(masID)
	delay := initialDelay
	path := l.Base + "/api/multi-agentic-systems/" + url.PathEscape(masID) + "?metadata=true"
	for {
		status, body, err := l.get(ctx, path)
		if err == nil && status == http.StatusOK {
			var details map[string]any
			if err := json.Unmarshal(body, &details); err != nil {
				slog.Warn("MAS details were not JSON", "event", "mas.fetch_failed", "stage", "CFN", "mas_id", masID)
				return
			}
			l.upsertMASIf(masID, details, gen, true)
			return
		}
		if err == nil && status == http.StatusNotFound {
			l.dropMAS(masID)
			return
		}
		if err == nil && status != http.StatusBadGateway && status != http.StatusServiceUnavailable {
			slog.Warn("MAS fetch failed", "event", "mas.fetch_failed", "stage", "CFN", "mas_id", masID, "status", status)
			return
		}
		if ctx.Err() != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		if delay < maxDelay {
			delay *= 2
			if delay > maxDelay {
				delay = maxDelay
			}
		}
	}
}

func (l *Lifecycle) get(ctx context.Context, endpoint string) (int, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, nil, err
	}
	resp, err := l.Client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1048576))
	return resp.StatusCode, body, err
}
