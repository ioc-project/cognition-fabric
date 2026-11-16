// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package oxp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"testing"
	"time"
)

const contextSession = "0001"

func spanRow(id, parent string) map[string]any {
	return map[string]any{"span_id": id, "session_id": contextSession, "span_name": "lookup.tool", "span_type": "tool", "parent_span_id": parent,
		"timestamp": "2026-10-16 13:00:00.000000000", "span_attributes": map[string]string{"traceloop.entity.input": `{"kwargs":{"query":"morning departures"}}`}}
}

func contextServer(t *testing.T, rows []map[string]any) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/sessions/"+contextSession+"/spans" || r.URL.Query().Get("order") != "asc" || r.URL.Query().Get("limit") != "500" {
			t.Errorf("unexpected OXP request: %s", r.URL)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
	}))
	t.Cleanup(srv.Close)
	return &Client{Base: srv.URL, HTTP: srv.Client()}
}

// Using the last earlier span would select the sibling model call. Only explicit
// parent/link ancestors belong to the current activity's context.
func TestSessionContextUsesCausalAncestorsInsteadOfTimestamp(t *testing.T) {
	root := spanRow("1111111111111111", "")
	parent := spanRow("2222222222222222", "1111111111111111")
	sibling := spanRow("3333333333333333", "1111111111111111")
	current := spanRow("4444444444444444", "2222222222222222")
	linked := spanRow("5555555555555555", "")
	current["links_trace_id"] = []string{"0123456789abcdef0123456789abcdef"}
	current["links_span_id"] = []string{"5555555555555555"}
	client := contextServer(t, []map[string]any{sibling, current, linked, parent, root})
	got, err := client.SessionContext(context.Background(), contextSession, "4444444444444444")
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, s := range got.Ancestors {
		ids = append(ids, s.ID)
	}
	if got.Current.ID != "4444444444444444" || !reflect.DeepEqual(ids, []string{"1111111111111111", "2222222222222222", "5555555555555555"}) {
		t.Fatalf("wrong causal context: current=%s ancestors=%v", got.Current.ID, ids)
	}
}

func TestSessionContextRejectsAmbiguousOrIncompleteEvidence(t *testing.T) {
	for _, tc := range []struct {
		name string
		rows []map[string]any
		want error
	}{
		{"current span absent", []map[string]any{spanRow("2222222222222222", "")}, ErrContextPending},
		{"parent not yet visible", []map[string]any{spanRow("1111111111111111", "2222222222222222")}, ErrContextPending},
		{"duplicate current id", []map[string]any{spanRow("1111111111111111", ""), spanRow("1111111111111111", "")}, ErrInvalidContext},
		{"cyclic ancestry", []map[string]any{spanRow("1111111111111111", "2222222222222222"), spanRow("2222222222222222", "1111111111111111")}, ErrInvalidContext},
		{"self parent", []map[string]any{spanRow("1111111111111111", "1111111111111111")}, ErrInvalidContext},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := contextServer(t, tc.rows).SessionContext(context.Background(), contextSession, "1111111111111111")
			if !errors.Is(err, tc.want) {
				t.Fatalf("got %v, want %v", err, tc.want)
			}
		})
	}
	wrongSession := spanRow("1111111111111111", "")
	wrongSession["session_id"] = "another-session"
	if _, err := contextServer(t, []map[string]any{wrongSession}).SessionContext(context.Background(), contextSession, "1111111111111111"); !errors.Is(err, ErrInvalidContext) {
		t.Fatalf("foreign session was accepted: %v", err)
	}
}

func TestSessionContextReadsAdditionalPages(t *testing.T) {
	var offsets []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		offset := r.URL.Query().Get("offset")
		offsets = append(offsets, offset)
		rows := []map[string]any{}
		if offset == "0" {
			for n := 1; n <= 500; n++ {
				rows = append(rows, spanRow(fmt.Sprintf("%016x", n), ""))
			}
		} else if offset == "500" {
			rows = append(rows, spanRow("ffffffffffffffff", "0000000000000001"))
		} else {
			t.Errorf("unexpected offset %s", offset)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
	}))
	defer srv.Close()
	got, err := (&Client{Base: srv.URL, HTTP: srv.Client()}).SessionContext(context.Background(), contextSession, "ffffffffffffffff")
	if err != nil || got.Current.ID != "ffffffffffffffff" || !reflect.DeepEqual(offsets, []string{"0", "500"}) {
		t.Fatalf("context=%+v offsets=%v err=%v", got, offsets, err)
	}
}

func TestSessionContextPropagatesCancellationToOXP(t *testing.T) {
	canceled := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
		close(canceled)
	}))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	_, err := (&Client{Base: srv.URL, HTTP: srv.Client()}).SessionContext(ctx, contextSession, "1111111111111111")
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("lost caller deadline: %v", err)
	}
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("OXP request did not observe cancellation")
	}
}

func TestSessionContextSpanLimitIsInclusive(t *testing.T) {
	for _, total := range []int{5000, 5001} {
		t.Run(strconv.Itoa(total), func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
				limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
				rows := []map[string]any{}
				for n := offset + 1; n <= min(offset+limit, total); n++ {
					rows = append(rows, spanRow(fmt.Sprintf("%016x", n), ""))
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": rows})
			}))
			defer srv.Close()
			got, err := (&Client{Base: srv.URL, HTTP: srv.Client()}).SessionContext(context.Background(), contextSession, "0000000000000001")
			if total == 5000 && (err != nil || got == nil) || total == 5001 && !errors.Is(err, ErrInvalidContext) {
				t.Fatalf("total=%d context=%+v err=%v", total, got, err)
			}
		})
	}
}

func TestSessionContextUsesOXPCanonicalSessionKey(t *testing.T) {
	const native = "noa-trip-planner-mas_82f980c7-83e0-4826-a4d7-24ed1a967e81"
	const canonical = "82f980c7-83e0-4826-a4d7-24ed1a967e81"
	for _, returnedNative := range []string{native, "other-app_" + canonical} {
		t.Run(returnedNative, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v1/sessions/"+canonical+"/spans" {
					t.Errorf("native session was not mapped to OXP's materialized key: %s", r.URL.Path)
				}
				row := spanRow("1111111111111111", "")
				row["session_id"] = canonical
				row["span_attributes"] = map[string]string{"session.id": returnedNative}
				_ = json.NewEncoder(w).Encode(map[string]any{"spans": []any{row}})
			}))
			defer srv.Close()
			got, err := (&Client{Base: srv.URL, HTTP: srv.Client()}).SessionContext(context.Background(), native, "1111111111111111")
			if returnedNative == native && (err != nil || got == nil) {
				t.Fatalf("native session did not resolve to OXP: %+v %v", got, err)
			}
			if returnedNative != native && !errors.Is(err, ErrInvalidContext) {
				t.Fatalf("another application's native session was accepted: %+v %v", got, err)
			}
		})
	}
}
