// Copyright 2026 Cisco Systems, Inc. and its affiliates
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/tools/easyhttp"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

func TestMASMetadataRepresentationAndLosslessJSON(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{ConfigVersion: 1, Workspaces: []WorkspaceCfg{{WorkspaceID: "assigned", MASList: []MASCfg{{ID: "mas"}}}}})
	response := `{"id":"mas","workspace_id":"assigned","name":"Rich","updated_at":"2026-11-09T12:13:14.123456+02:00","created_at":"2026-11-08T12:13:14.123456789+02:00","agents":[{"agent_id":"a","cf_agent_id":"uuid","agent_descriptions":[{"format":"future","collected_at":"2026-11-09T11:12:13Z","content":{"big":900719925474099312345}}]}],"tools":[],"topologies":[],"metadata":{"big":900719925474099312345,"null":null},"cognition_engines":[{"ce_id":"ce","name":"Demo","version":"1","ce_type":"CASA","enforcing_url":"localhost:18001","enforcing_endpoint":"Evaluate","enforcing_protocol":"grpc","enabled":true,"status":"online","mas_config":{"big":900719925474099312345,"updated_at":"keep nested timestamps unchanged"}}]}`
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/workspaces/assigned/multi-agentic-systems/mas" {
			t.Errorf("wrong workspace: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(response))
	}))
	defer backend.Close()
	MgmtURL = backend.URL
	router := easyhttp.NewRouter()
	router.Get("/api/multi-agentic-systems/{masId}", (&App{}).getMASHandler)
	for _, expanded := range []bool{false, true} {
		suffix := ""
		if expanded {
			suffix = "?metadata=true"
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/mas"+suffix, nil))
		if w.Code != 200 {
			t.Fatalf("status=%d body=%s", w.Code, w.Body)
		}
		var body map[string]json.RawMessage
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if expanded {
			if string(body["updated_at"]) != `"2026-11-09T10:13:14.123456Z"` {
				t.Fatalf("wrong UTC: %s", body["updated_at"])
			}
			if string(body["created_at"]) != `"2026-11-08T10:13:14.123456789Z"` {
				t.Fatalf("wrong UTC: %s", body["created_at"])
			}
			if !strings.Contains(string(body["agents"]), "900719925474099312345") || !strings.Contains(string(body["metadata"]), "900719925474099312345") || !strings.Contains(string(body["cognition_engines"]), "900719925474099312345") {
				t.Fatalf("numeric corruption: %s", w.Body)
			}
			if string(body["tools"]) != "[]" || string(body["topologies"]) != "[]" {
				t.Fatalf("empty collections lost: %s", w.Body)
			}
			if !strings.Contains(string(body["agents"]), `"collected_at":"2026-11-09T11:12:13Z"`) || !strings.Contains(string(body["cognition_engines"]), `"updated_at":"keep nested timestamps unchanged"`) {
				t.Fatalf("nested timestamps changed: %s", w.Body)
			}
		} else {
			want := `{"cognition_engines":[{"ce_id":"ce","ce_type":"CASA","enabled":true,"enforcing_endpoint":"Evaluate","enforcing_protocol":"grpc","enforcing_url":"localhost:18001","name":"Demo","status":"online","version":"1"}],"id":"mas","name":"Rich","workspace_id":"assigned"}`
			if w.Body.String() != want {
				t.Fatalf("legacy response changed:\ngot  %s\nwant %s", w.Body, want)
			}
		}
	}
	response = `{"id":"mas","name":"Legacy","updated_at":"invalid","cognition_engines":[]}`
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/mas?metadata=true", nil))
	if w.Code != 200 || strings.Contains(w.Body.String(), "updated_at") || strings.Contains(w.Body.String(), "topologies") {
		t.Fatalf("bad optional timestamp behavior: %s", w.Body)
	}
}

func TestMASMetadataOptionalTimestamps(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{ConfigVersion: 1, Workspaces: []WorkspaceCfg{{WorkspaceID: "assigned", MASList: []MASCfg{{ID: "mas"}}}}})
	core, logs := observer.New(zap.WarnLevel)
	previousLogger := getLogger()
	l = zap.New(core).Sugar()
	t.Cleanup(func() { l = previousLogger })

	// These nested documents must survive unchanged, even if they contain other
	// timestamp formats. Only the two top-level fields are normalized.
	base := `{"id":"mas","workspace_id":"assigned","name":"Rich","agents":[{"agent_id":"a","agent_descriptions":[{"collected_at":"2026-11-09T11:12:13Z"}]}],"tools":[{"tool_id":"tool","provenance":{"collected_at":"2026-11-09T11:12:13Z"}}],"topologies":[{"source":"provided","updated_at":"2026-11-09T11:12:13Z","nodes":[],"edges":[]}],"documentation":[{"collected_at":"2026-11-09T12:13:14+02:00"}],"metadata":{"big":900719925474099312345},"cognition_engines":[]}`
	var response []byte
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(response)
	}))
	defer backend.Close()
	MgmtURL = backend.URL
	router := easyhttp.NewRouter()
	router.Get("/api/multi-agentic-systems/{masId}", (&App{}).getMASHandler)

	for _, tt := range []struct {
		name, updated, created, wantUpdated, wantCreated string
		warnings                                         []string
	}{
		{name: "UTC", updated: `"2026-11-09T10:13:14.123456789Z"`, created: `"2026-11-08T10:13:14Z"`, wantUpdated: `"2026-11-09T10:13:14.123456789Z"`, wantCreated: `"2026-11-08T10:13:14Z"`},
		{name: "offsets", updated: `"2026-11-09T12:13:14+02:00"`, created: `"2026-11-08T08:13:14-02:00"`, wantUpdated: `"2026-11-09T10:13:14Z"`, wantCreated: `"2026-11-08T10:13:14Z"`},
		{name: "zone-less", updated: `"2026-11-09T12:13:14.123456"`, created: `"2026-11-08T12:13:14"`, warnings: []string{"updated_at", "created_at"}},
		{name: "invalid strings", updated: `"invalid"`, created: `""`, warnings: []string{"updated_at", "created_at"}},
		{name: "non-strings", updated: `123`, created: `false`, warnings: []string{"updated_at", "created_at"}},
		{name: "objects and arrays", updated: `{}`, created: `[]`, warnings: []string{"updated_at", "created_at"}},
		{name: "invalid updated", updated: `"invalid"`, created: `"2026-11-08T12:13:14+02:00"`, wantCreated: `"2026-11-08T10:13:14Z"`, warnings: []string{"updated_at"}},
		{name: "invalid created", updated: `"2026-11-09T12:13:14+02:00"`, created: `"invalid"`, wantUpdated: `"2026-11-09T10:13:14Z"`, warnings: []string{"created_at"}},
		{name: "null", updated: `null`, created: `null`},
		{name: "absent"},
		{name: "null updated absent created", updated: `null`},
		{name: "absent updated null created", created: `null`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var payload map[string]json.RawMessage
			if err := json.Unmarshal([]byte(base), &payload); err != nil {
				t.Fatal(err)
			}
			for field, raw := range map[string]string{"updated_at": tt.updated, "created_at": tt.created} {
				if raw != "" {
					payload[field] = json.RawMessage(raw)
				}
			}
			var err error
			response, err = json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/mas?metadata=true", nil))
			if w.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", w.Code, w.Body)
			}
			var body map[string]json.RawMessage
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			for field, want := range map[string]string{"updated_at": tt.wantUpdated, "created_at": tt.wantCreated} {
				if got := string(body[field]); got != want {
					t.Errorf("%s = %s, want %s", field, got, want)
				}
				delete(payload, field)
				delete(body, field)
			}
			remaining, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			expected, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			if string(remaining) != string(expected) {
				t.Errorf("remaining metadata changed:\ngot  %s\nwant %s", remaining, expected)
			}
			entries := logs.TakeAll()
			if len(entries) != len(tt.warnings) {
				t.Fatalf("warnings = %v, want fields %v", entries, tt.warnings)
			}
			for i, entry := range entries {
				context := entry.ContextMap()
				if context["mas_id"] != "mas" || context["field"] != tt.warnings[i] || context["reason"] == nil || context["reason"] == "" {
					t.Errorf("warning missing MAS, field or reason: %v", context)
				}
			}
		})
	}
}

func TestNormalizeUTCTimestamp(t *testing.T) {
	for _, tt := range []struct {
		name, value, want string
		bad               bool
	}{
		{"UTC", `"2026-11-09T11:12:13.123456789Z"`, `"2026-11-09T11:12:13.123456789Z"`, false},
		{"positive offset", `"2026-11-09T11:12:13.123456789+02:00"`, `"2026-11-09T09:12:13.123456789Z"`, false},
		{"negative offset", `"2026-11-09T23:12:13-02:00"`, `"2026-11-10T01:12:13Z"`, false},
		{"zone-less", `"2026-11-09T11:12:13"`, "", true},
		{"invalid string", `"not-a-date"`, "", true},
		{"empty string", `""`, "", true},
		{"number", `123`, "", true},
		{"boolean", `false`, "", true},
		{"object", `{}`, "", true},
		{"array", `[]`, "", true},
		{"invalid JSON", `"unterminated`, "", true},
		{"absent", "", "", false},
		{"null", `null`, "", false},
		{"whitespace null", " \nnull\t", "", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeUTCTimestamp(json.RawMessage(tt.value))
			if (err != nil) != tt.bad || string(got) != tt.want {
				t.Errorf("%s got=%s err=%v, want=%s error=%v", tt.value, got, err, tt.want, tt.bad)
			}
			if tt.want == "" && got != nil {
				t.Errorf("omitted timestamp should be nil, got %q", got)
			}
		})
	}
}
