package oxp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/ids"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
)

// ErrEventPending means OXP does not (yet) expose the event: it may still be on its way through ingestion.
var ErrEventPending = errors.New("OXP event is not visible")

const (
	maxRealtimeBytes = 4 << 20
	spanEventsLimit  = 200
)

// RealtimeEvent is a normalized event as the realtime endpoints return it. Raw keeps the whole payload so
// the evidence parsers read it exactly like an event pushed to the inbox.
type RealtimeEvent struct {
	ID        string
	Type      string
	TraceID   string
	SpanID    string
	ParentID  string
	SessionID string
	Raw       json.RawMessage
}

type realtimeWire struct {
	EventID     string `json:"event_id"`
	Type        string `json:"type"`
	Correlation struct {
		TraceID  string `json:"trace_id"`
		SpanID   string `json:"span_id"`
		ParentID string `json:"parent_event_id"`
	} `json:"correlation"`
	Session struct {
		ID string `json:"id"`
	} `json:"session"`
}

func decodeRealtime(raw json.RawMessage) (RealtimeEvent, error) {
	var w realtimeWire
	if json.Unmarshal(raw, &w) != nil || !ids.Valid(w.Correlation.TraceID, 32) || !ids.Valid(w.Correlation.SpanID, 16) || w.EventID == "" || w.Type == "" {
		return RealtimeEvent{}, fmt.Errorf("%w: malformed realtime event", ErrInvalidContext)
	}
	return RealtimeEvent{ID: w.EventID, Type: w.Type, TraceID: w.Correlation.TraceID, SpanID: w.Correlation.SpanID,
		ParentID: w.Correlation.ParentID, SessionID: w.Session.ID, Raw: raw}, nil
}

func (c *Client) get(ctx context.Context, path string, q url.Values) ([]byte, error) {
	endpoint := c.Base + path
	if len(q) > 0 {
		endpoint += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxRealtimeBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxRealtimeBytes {
		return nil, fmt.Errorf("OXP realtime response exceeds byte limit")
	}
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return nil, ErrEventPending
	case resp.StatusCode != http.StatusOK:
		return nil, fmt.Errorf("OXP realtime HTTP %d", resp.StatusCode)
	}
	return raw, nil
}

// Event reads GET /api/v1/realtime/events/{id}. ErrEventPending is a 404; any other error is a failure of
// the endpoint, not an answer about the event.
func (c *Client) Event(ctx context.Context, id string) (event RealtimeEvent, err error) {
	started := time.Now()
	logger := logging.FromContext(ctx).With("method", "GET", "endpoint", "/api/v1/realtime/events/{event_id}", "event_id", id)
	logger.InfoContext(ctx, "Fetching pre-call event from OXP realtime", "event", "oxp.realtime.start", "stage", "OXP", "lookup", "event")
	defer func() {
		state := "available"
		if errors.Is(err, ErrEventPending) {
			state = "pending"
		} else if err != nil {
			state = "unavailable"
		}
		logger.InfoContext(ctx, "OXP realtime lookup finished; evidence still requires correlation validation", "event", "oxp.realtime.complete", "stage", "OXP", "state", state, "elapsed_ms", time.Since(started).Milliseconds())
	}()
	raw, err := c.get(ctx, "/api/v1/realtime/events/"+url.PathEscape(id), nil)
	if err != nil {
		return RealtimeEvent{}, err
	}
	event, err = decodeRealtime(raw)
	if err != nil {
		return RealtimeEvent{}, err
	}
	if event.ID != id {
		return RealtimeEvent{}, fmt.Errorf("%w: realtime event id mismatch", ErrInvalidContext)
	}
	return event, nil
}

// SpanEvents reads the events of one span of the given types (GET /api/v1/realtime/spans/{span}/events).
// A truncated listing cannot prove that an event is absent, so it is reported as invalid.
func (c *Client) SpanEvents(ctx context.Context, spanID string, eventTypes string) (events []RealtimeEvent, err error) {
	started := time.Now()
	logger := logging.FromContext(ctx).With("method", "GET", "endpoint", "/api/v1/realtime/spans/{span_id}/events", "event_types", eventTypes)
	logger.InfoContext(ctx, "Fetching pre-call span events from OXP realtime", "event", "oxp.realtime.start", "stage", "OXP", "lookup", "span_events")
	defer func() {
		state := "available"
		if errors.Is(err, ErrEventPending) {
			state = "pending"
		} else if err != nil {
			state = "unavailable"
		}
		logger.InfoContext(ctx, "OXP realtime lookup finished; evidence still requires correlation validation", "event", "oxp.realtime.complete", "stage", "OXP", "state", state, "elapsed_ms", time.Since(started).Milliseconds())
	}()
	if !ids.Valid(spanID, 16) {
		return nil, fmt.Errorf("%w: valid span required", ErrInvalidContext)
	}
	q := url.Values{"event_types": {eventTypes}, "limit": {strconv.Itoa(spanEventsLimit)}}
	raw, err := c.get(ctx, "/api/v1/realtime/spans/"+url.PathEscape(spanID)+"/events", q)
	if err != nil {
		return nil, err
	}
	var page struct {
		Events  []json.RawMessage `json:"events"`
		HasMore bool              `json:"has_more"`
	}
	if json.Unmarshal(raw, &page) != nil || page.Events == nil {
		return nil, fmt.Errorf("%w: malformed span events response", ErrInvalidContext)
	}
	if page.HasMore {
		return nil, fmt.Errorf("%w: span events exceed the page limit", ErrInvalidContext)
	}
	out := make([]RealtimeEvent, 0, len(page.Events))
	for _, item := range page.Events {
		event, err := decodeRealtime(item)
		if err != nil {
			return nil, err
		}
		out = append(out, event)
	}
	return out, nil
}
