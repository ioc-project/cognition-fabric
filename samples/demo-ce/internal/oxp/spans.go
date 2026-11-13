// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

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
	"strings"
	"time"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/ids"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/logging"
)

var (
	ErrContextPending = errors.New("OXP activity or causal ancestor is not visible")
	ErrInvalidContext = errors.New("OXP activity context is ambiguous or invalid")
)

const (
	spanPageSize    = 500
	maxContextSpans = 5000
	maxContextBytes = 8 << 20
	maxCausalDepth  = 128
)

// Span mirrors OXP's SpanMetadataItem. That contract does not expose the span's
// own trace ID, so a session/span lookup cannot confirm a submitted trace ID.
type Span struct {
	ID           string                     `json:"span_id"`
	SessionID    string                     `json:"session_id"`
	Name         string                     `json:"span_name"`
	Type         string                     `json:"span_type"`
	ParentID     string                     `json:"parent_span_id"`
	Attributes   map[string]json.RawMessage `json:"span_attributes"`
	LinkTraceIDs []string                   `json:"links_trace_id"`
	LinkSpanIDs  []string                   `json:"links_span_id"`
}

// ActivityContext contains the selected activity and only its causal ancestors,
// parents before children. Earlier siblings are not context for this activity.
type ActivityContext struct {
	Current   Span
	Ancestors []Span
}

// SessionContext reads the complete bounded session snapshot and follows explicit
// parent/link references. The caller owns readiness retries and the total deadline.
func (c *Client) SessionContext(ctx context.Context, sessionID, spanID string) (history *ActivityContext, err error) {
	started := time.Now()
	logger := logging.FromContext(ctx)
	logger.InfoContext(ctx, "Reading OXP session spans and following parent/link ancestors", "event", "oxp.context.start", "stage", "OXP", "session_id", sessionID, "method", "GET", "endpoint", "/api/v1/sessions/{session_id}/spans")
	defer func() {
		state := "available"
		ancestors := 0
		if history != nil {
			ancestors = len(history.Ancestors)
		}
		if errors.Is(err, ErrContextPending) {
			state = "pending"
		} else if err != nil {
			state = "unavailable"
		}
		logger.InfoContext(ctx, "OXP causal context lookup finished", "event", "oxp.context.complete", "stage", "OXP", "state", state, "ancestor_count", ancestors, "trace_identity_confirmed", false, "elapsed_ms", time.Since(started).Milliseconds())
	}()
	if sessionID == "" || !ids.Valid(spanID, 16) {
		return nil, fmt.Errorf("%w: session and valid span required", ErrInvalidContext)
	}
	nativeSessionID := sessionID
	// OXP's session_id materialized column removes everything through the first
	// underscore from Observe's application_UUID session.id. Preserve the native
	// value for event binding and validate it when returned in span attributes.
	if _, key, prefixed := strings.Cut(sessionID, "_"); prefixed {
		sessionID = key
		if sessionID == "" {
			return nil, fmt.Errorf("%w: empty OXP session key", ErrInvalidContext)
		}
	}
	byID := map[string]Span{}
	bytesRead := 0
	for offset := 0; offset <= maxContextSpans; offset += spanPageSize {
		limit := spanPageSize
		if offset == maxContextSpans {
			limit = 1 // distinguish exactly the limit from an oversized session
		}
		q := url.Values{"limit": {strconv.Itoa(limit)}, "offset": {strconv.Itoa(offset)}, "order": {"asc"}}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.Base+"/api/v1/sessions/"+url.PathEscape(sessionID)+"/spans?"+q.Encode(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Cache-Control", "no-cache")
		resp, err := c.HTTP.Do(req)
		if err != nil {
			return nil, err
		}
		raw, readErr := io.ReadAll(io.LimitReader(resp.Body, int64(maxContextBytes-bytesRead+1)))
		resp.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		bytesRead += len(raw)
		if bytesRead > maxContextBytes {
			return nil, fmt.Errorf("%w: session context exceeds byte limit", ErrInvalidContext)
		}
		if resp.StatusCode == http.StatusNotFound {
			return nil, ErrContextPending
		}
		if resp.StatusCode != http.StatusOK {
			if resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusRequestTimeout {
				return nil, fmt.Errorf("OXP session spans HTTP %d", resp.StatusCode)
			}
			return nil, fmt.Errorf("%w: session spans HTTP %d", ErrInvalidContext, resp.StatusCode)
		}
		var page struct {
			Spans []Span `json:"spans"`
		}
		if err := json.Unmarshal(raw, &page); err != nil || page.Spans == nil || len(page.Spans) > limit {
			return nil, fmt.Errorf("%w: malformed session spans response", ErrInvalidContext)
		}
		if len(byID)+len(page.Spans) > maxContextSpans {
			return nil, fmt.Errorf("%w: session context exceeds span limit", ErrInvalidContext)
		}
		for _, span := range page.Spans {
			if span.SessionID != sessionID || !ids.Valid(span.ID, 16) {
				return nil, fmt.Errorf("%w: span identity/session mismatch", ErrInvalidContext)
			}
			if nativeSessionID != sessionID {
				if raw, exists := span.Attributes["session.id"]; exists {
					var native string
					if json.Unmarshal(raw, &native) != nil || native != nativeSessionID {
						return nil, fmt.Errorf("%w: native span session mismatch", ErrInvalidContext)
					}
				}
			}
			if _, exists := byID[span.ID]; exists {
				return nil, fmt.Errorf("%w: duplicate span ID", ErrInvalidContext)
			}
			byID[span.ID] = span
		}
		if len(page.Spans) < limit {
			return causalContext(byID, spanID)
		}
	}
	return nil, fmt.Errorf("%w: session context exceeds span limit", ErrInvalidContext)
}

func causalContext(byID map[string]Span, spanID string) (*ActivityContext, error) {
	current, ok := byID[spanID]
	if !ok {
		return nil, ErrContextPending
	}
	result := &ActivityContext{Current: current}
	state := map[string]uint8{}
	var visit func(string, int) error
	visit = func(id string, depth int) error {
		if state[id] == 1 || depth > maxCausalDepth {
			return fmt.Errorf("%w: cyclic or excessive ancestry", ErrInvalidContext)
		}
		if state[id] == 2 {
			return nil
		}
		span, ok := byID[id]
		if !ok {
			return ErrContextPending
		}
		state[id] = 1
		if span.ParentID != "" && span.ParentID != "0000000000000000" {
			if !ids.Valid(span.ParentID, 16) {
				return fmt.Errorf("%w: invalid parent ID", ErrInvalidContext)
			}
			if err := visit(span.ParentID, depth+1); err != nil {
				return err
			}
		}
		if len(span.LinkSpanIDs) != len(span.LinkTraceIDs) {
			return fmt.Errorf("%w: incomplete span links", ErrInvalidContext)
		}
		for n, linkedID := range span.LinkSpanIDs {
			if !ids.Valid(linkedID, 16) || !ids.Valid(span.LinkTraceIDs[n], 32) {
				return fmt.Errorf("%w: invalid span link", ErrInvalidContext)
			}
			if err := visit(linkedID, depth+1); err != nil {
				return err
			}
		}
		state[id] = 2
		if id != spanID {
			result.Ancestors = append(result.Ancestors, span)
		}
		return nil
	}
	if err := visit(spanID, 0); err != nil {
		return nil, err
	}
	return result, nil
}
