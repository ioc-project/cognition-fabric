// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/cisco-eti/cognition-fabric/cfn/pkg/tools/easyhttp"
	"go.yaml.in/yaml/v3"
)

func readCEContract(t *testing.T, name string) map[string]any {
	t.Helper()
	data, err := os.ReadFile("../../../api/ce/openapi/" + name)
	if err != nil {
		t.Fatal(err)
	}
	var spec map[string]any
	if err := yaml.Unmarshal(data, &spec); err != nil {
		t.Fatal(err)
	}
	if spec["openapi"] != "3.0.3" {
		t.Fatalf("unexpected OpenAPI version: %v", spec["openapi"])
	}
	return spec
}

func contractObject(value any) map[string]any { return value.(map[string]any) }
func contractSchema(spec map[string]any, name string) map[string]any {
	return contractObject(contractObject(contractObject(spec["components"])["schemas"])[name])
}

// Validate the JSON Schema subset used by these OAS3 response contracts. This
// checks real handler output, including optional/null shapes and closed legacy keys.
func validateCEContract(spec, schema map[string]any, value any) error {
	if ref, ok := schema["$ref"].(string); ok {
		const prefix = "#/components/schemas/"
		if !strings.HasPrefix(ref, prefix) {
			return fmt.Errorf("unsupported ref %s", ref)
		}
		return validateCEContract(spec, contractSchema(spec, strings.TrimPrefix(ref, prefix)), value)
	}
	if value == nil && schema["nullable"] == true {
		return nil
	}
	if required, ok := schema["required"].([]any); ok {
		if object, isObject := value.(map[string]any); isObject {
			for _, key := range required {
				if _, exists := object[key.(string)]; !exists {
					return fmt.Errorf("missing %s", key)
				}
			}
		}
	}
	if choices, ok := schema["anyOf"].([]any); ok {
		matched := false
		for _, choice := range choices {
			matched = matched || validateCEContract(spec, contractObject(choice), value) == nil
		}
		if !matched {
			return fmt.Errorf("value matches no declared response shape")
		}
	}
	if allowed, ok := schema["enum"].([]any); ok {
		found := false
		for _, candidate := range allowed {
			found = found || reflect.DeepEqual(candidate, value)
		}
		if !found {
			return fmt.Errorf("value %v is outside enum", value)
		}
	}
	switch schema["type"] {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("expected object, got %T", value)
		}
		properties, _ := schema["properties"].(map[string]any)
		if required, ok := schema["required"].([]any); ok {
			for _, key := range required {
				if _, exists := object[key.(string)]; !exists {
					return fmt.Errorf("missing %s", key)
				}
			}
		}
		for key, item := range object {
			if property, exists := properties[key]; exists {
				if err := validateCEContract(spec, contractObject(property), item); err != nil {
					return fmt.Errorf("%s: %w", key, err)
				}
			} else if schema["additionalProperties"] == false {
				return fmt.Errorf("undeclared property %s", key)
			}
		}
	case "array":
		array, ok := value.([]any)
		if !ok {
			return fmt.Errorf("expected array, got %T", value)
		}
		for _, item := range array {
			if err := validateCEContract(spec, contractObject(schema["items"]), item); err != nil {
				return err
			}
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("expected string, got %T", value)
		}
		if schema["format"] == "date-time" {
			if _, err := time.Parse(time.RFC3339Nano, text); err != nil {
				return err
			}
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected boolean, got %T", value)
		}
	}
	return nil
}

func TestCERestSpecificationAudienceAndReferences(t *testing.T) {
	spec := readCEContract(t, "cfn-ce.yaml")
	paths := contractObject(spec["paths"])
	got := make([]string, 0, len(paths))
	for path := range paths {
		got = append(got, path)
	}
	sort.Strings(got)
	want := []string{"/api/cognition-engine", "/api/cognition-engine/{ceId}", "/api/cognition-engine/{ceId}/multi-agentic-systems", "/api/multi-agentic-systems/{masId}"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("public route set = %v, want %v", got, want)
	}
	getMAS := contractObject(contractObject(paths["/api/multi-agentic-systems/{masId}"])["get"])
	response := contractObject(contractObject(getMAS["responses"])["200"])
	wireSchema := contractObject(contractObject(contractObject(response["content"])["application/json"])["schema"])
	choices, ok := wireSchema["anyOf"].([]any)
	if !ok || len(choices) != 2 {
		t.Fatal("GET MAS must document both overlapping response shapes with anyOf")
	}
	for i, name := range []string{"LegacyMASResponse", "ExpandedMASResponse"} {
		if contractObject(choices[i])["$ref"] != "#/components/schemas/"+name {
			t.Fatalf("GET MAS response choice %d does not reference %s", i, name)
		}
	}
	var visit func(any)
	visit = func(value any) {
		switch node := value.(type) {
		case map[string]any:
			if ref, ok := node["$ref"].(string); ok {
				prefix := "#/components/schemas/"
				if !strings.HasPrefix(ref, prefix) || contractSchema(spec, strings.TrimPrefix(ref, prefix)) == nil {
					t.Fatalf("unresolved ref %s", ref)
				}
			}
			for _, child := range node {
				visit(child)
			}
		case []any:
			for _, child := range node {
				visit(child)
			}
		}
	}
	visit(spec)
	// The default legacy schema must reject accidental future metadata leakage.
	invalid := map[string]any{"id": "m", "workspace_id": "w", "name": "n", "cognition_engines": []any{}, "config": map[string]any{}}
	if validateCEContract(spec, contractSchema(spec, "LegacyMASResponse"), invalid) == nil {
		t.Fatal("legacy schema accepts metadata outside its existing keys")
	}
}

func TestMASHandlerResponsesMatchCEContract(t *testing.T) {
	restore := restoreRoutingGlobals()
	defer restore()
	applyParsedConfig(&CfnConfigPayload{ConfigVersion: 1, Workspaces: []WorkspaceCfg{{WorkspaceID: "assigned", MASList: []MASCfg{{ID: "mas"}}}}})
	var upstream string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(upstream))
	}))
	defer backend.Close()
	MgmtURL = backend.URL
	router := easyhttp.NewRouter()
	router.Get("/api/multi-agentic-systems/{masId}", (&App{}).getMASHandler)
	spec := readCEContract(t, "cfn-ce.yaml")
	payloads := []string{
		`{"id":"mas","workspace_id":"assigned","name":"Minimal","cognition_engines":null}`,
		`{"id":"mas","workspace_id":"assigned","name":"Empty","cognition_engines":[],"agents":[],"config":{}}`,
		`{"id":"mas","workspace_id":"assigned","name":"Null CE configuration","cognition_engines":[{"ce_id":"ce","mas_config":null}]}`,
		`{"id":"mas","workspace_id":"assigned","name":"Rich","cognition_engines":[{"ce_id":"ce","name":"Demo","version":"1","ce_type":"CASA","enforcing_url":"localhost:18001","enforcing_endpoint":"ioc.ce.v1.CognitionEngine","enforcing_protocol":"grpc","enabled":true,"status":"online","mas_config":{"opaque":null}}],"updated_at":"2026-11-13T17:00:00+02:00","created_at":"invalid","metadata":{"big":900719925474099312345,"nested":[null,true,1]}}`,
	}
	for i, payload := range payloads {
		upstream = payload
		for _, expanded := range []bool{false, true} {
			suffix, schema := "", "LegacyMASResponse"
			if expanded {
				suffix, schema = "?metadata=true", "ExpandedMASResponse"
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/multi-agentic-systems/mas"+suffix, nil))
			if recorder.Code != 200 {
				t.Fatalf("payload%d status%d", i, recorder.Code)
			}
			decoder := json.NewDecoder(bytes.NewReader(recorder.Body.Bytes()))
			decoder.UseNumber()
			var value any
			if err := decoder.Decode(&value); err != nil {
				t.Fatal(err)
			}
			if err := validateCEContract(spec, contractSchema(spec, schema), value); err != nil {
				t.Fatalf("payload%d expanded%v violates %s: %v", i, expanded, schema, err)
			}
		}
	}
}

func TestNotificationWirePayloadMatchesCallbackContract(t *testing.T) {
	spec := readCEContract(t, "ce-callbacks.yaml")
	received := make(chan map[string]any, 1)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		var value map[string]any
		if err := json.NewDecoder(r.Body).Decode(&value); err != nil {
			t.Error(err)
		}
		received <- value
		w.WriteHeader(http.StatusOK)
	}))
	defer receiver.Close()
	started := time.Now().UTC().Add(-time.Second)
	(&App{}).sendNotification(EngineCfg{ID: "ce", NotificationURL: receiver.URL, NotificationEndpoint: "/notification"}, MASChange{EventType: "mas.updated", MASID: "mas"})
	select {
	case value := <-received:
		if err := validateCEContract(spec, contractSchema(spec, "MASLifecycleNotification"), value); err != nil {
			t.Fatal(err)
		}
		if value["event_type"] != "mas.updated" || value["mas_id"] != "mas" {
			t.Fatalf("wrong notification: %v", value)
		}
		instant, err := time.Parse(time.RFC3339, value["timestamp"].(string))
		if err != nil || !strings.HasSuffix(value["timestamp"].(string), "Z") || instant.Before(started) {
			t.Fatalf("invalid UTC event time: %v", value["timestamp"])
		}
	case <-time.After(time.Second):
		t.Fatal("notification was not observed")
	}
}

func TestCERestSpecificationStatusCoverage(t *testing.T) {
	spec := readCEContract(t, "cfn-ce.yaml")
	paths := contractObject(spec["paths"])
	for _, tc := range []struct {
		path, method string
		statuses     []string
	}{
		{"/api/cognition-engine", "post", []string{"200", "201", "400", "404", "409", "422", "500", "502", "503", "default"}},
		{"/api/cognition-engine/{ceId}", "delete", []string{"204", "400", "404", "409", "502", "503", "default"}},
		{"/api/cognition-engine/{ceId}", "patch", []string{"200", "400", "404", "422", "500", "502", "503", "default"}},
		{"/api/cognition-engine/{ceId}/multi-agentic-systems", "get", []string{"200", "400", "404", "500", "503"}},
		{"/api/multi-agentic-systems/{masId}", "get", []string{"200", "400", "404", "500", "502", "503"}},
	} {
		responses := contractObject(contractObject(contractObject(paths[tc.path])[tc.method])["responses"])
		for _, status := range tc.statuses {
			if _, ok := responses[status]; !ok {
				t.Errorf("%s %s omits existing status%s", tc.method, tc.path, status)
			}
		}
	}
}

func TestCERegistrationAndDeletionStatusContracts(t *testing.T) {
	spec := readCEContract(t, "cfn-ce.yaml")
	oldID := CfnID
	CfnID = "contract-cfn"
	defer func() { CfnID = oldID }()
	for _, tc := range []struct {
		name, method, path, response string
		status                       int
	}{
		{"new registration", http.MethodPost, "/api/cognition-engine", `{"ce_id":"ce","cfn_id":"contract-cfn","name":"ce","version":"1.0.0","ce_type":"CASA","created":true}`, http.StatusCreated},
		{"existing registration", http.MethodPost, "/api/cognition-engine", `{"ce_id":"ce","cfn_id":"contract-cfn","name":"ce","version":"1.0.0","ce_type":"CASA","created":false}`, http.StatusOK},
		{"duplicate registration reconnect recovery", http.MethodPost, "/api/cognition-engine", `{"detail":{"error":"CE already exists","existing_ce_id":"550e8400-e29b-41d4-a716-446655440000"}}`, http.StatusConflict},
		{"associated CE deletion", http.MethodDelete, "/api/cognition-engine/{ceId}", `{"detail":"CE cannot be deleted while it has active MAS associations"}`, http.StatusConflict},
	} {
		t.Run(tc.name, func(t *testing.T) {
			refreshed := make(chan struct{}, 1)
			backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.Method == http.MethodGet {
					_, _ = w.Write([]byte(`{}`))
					select {
					case refreshed <- struct{}{}:
					default:
					}
					return
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.response))
			}))
			defer backend.Close()
			t.Setenv("MGMT_URL", backend.URL)
			router := easyhttp.NewRouter()
			router.Post("/api/cognition-engine", (&App{}).registerCognitionEngineHandler)
			router.Delete("/api/cognition-engine/{ceId}", (&App{}).deleteCognitionEngineHandler)
			body := `{"name":"ce","version":"1.0.0","ce_type":"CASA","health_url":"http://localhost:18000","health_endpoint":"/healthz"}`
			path := strings.ReplaceAll(tc.path, "{ceId}", "550e8400-e29b-41d4-a716-446655440000")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(tc.method, path, strings.NewReader(body)))
			if recorder.Code != tc.status {
				t.Fatalf("status=%d, want%d", recorder.Code, tc.status)
			}
			operation := contractObject(contractObject(contractObject(spec["paths"])[tc.path])[strings.ToLower(tc.method)])
			declared := contractObject(contractObject(operation["responses"])[fmt.Sprint(recorder.Code)])
			schema := contractObject(contractObject(contractObject(declared["content"])["application/json"])["schema"])
			var value any
			if err := json.Unmarshal(recorder.Body.Bytes(), &value); err != nil {
				t.Fatal(err)
			}
			if err := validateCEContract(spec, schema, value); err != nil {
				t.Fatalf("status%d violates declared response: %v", recorder.Code, err)
			}
			if tc.status == http.StatusConflict && tc.method == http.MethodPost {
				detail := contractObject(contractObject(value)["detail"])
				if detail["existing_ce_id"] != "550e8400-e29b-41d4-a716-446655440000" {
					t.Fatal("reconnect recovery ID lost")
				}
			}
			if tc.status == http.StatusOK || tc.status == http.StatusCreated {
				// Wait for the handler's existing delayed refresh to reach only
				// this test server before restoring its global registration ID.
				select {
				case <-refreshed:
				case <-time.After(2 * time.Second):
					t.Fatal("test-only automatic refresh not observed")
				}
			}
		})
	}
}
