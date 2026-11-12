// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package inbox

import (
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	trace = "0123456789abcdef0123456789abcdef"
	span  = "0123456789abcdef"
)

// A callback from another service, or another span in the trace, must never correlate.
func TestInboxScopeAndExactReference(t *testing.T) {
	i := New("noa", 2)
	send := func(service, sid string) int {
		body := `{"type":"a2a.message.sent","time":"2026-10-13T10:00:00Z","session":{"id":"native-uuid","sequence":1},"source":{"service_name":"` + service + `"},"correlation":{"trace_id":"` + trace + `","span_id":"` + sid + `"},"data":{"message":{"id":"m1"}}}`
		w := httptest.NewRecorder()
		i.Receive(w, httptest.NewRequest("POST", "/events", strings.NewReader(body)))
		return w.Code
	}
	if got := send("other", span); got != 403 {
		t.Fatalf("scope: %d", got)
	}
	if got := send("noa", span); got != 202 {
		t.Fatalf("callback: %d", got)
	}
	send("noa", span)
	if len(i.Lookup(trace, span)) != 1 || len(i.Lookup(trace, "fedcba9876543210")) != 0 {
		t.Fatal("dedup or exact span correlation broken")
	}
	send("noa", "fedcba9876543210")
	send("noa", "1111111111111111")
	if len(i.Lookup(trace, span)) != 0 {
		t.Fatal("capacity exceeded")
	}
}
