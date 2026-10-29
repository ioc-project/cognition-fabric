// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	api "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/enforcement/v1"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"gorm.io/datatypes"
)

func proxyFixture(t *testing.T, variant string) *api.AuditRecord {
	t.Helper()
	raw, err := os.ReadFile("testdata/proxy_" + variant + ".json")
	if err != nil {
		t.Fatal(err)
	}
	record := new(api.AuditRecord)
	if err := protojson.Unmarshal(raw, record); err != nil {
		t.Fatal(err)
	}
	return record
}

func TestProxyVariantsAndRoundTrip(t *testing.T) {
	for _, variant := range []string{"mediation", "authorization", "response"} {
		t.Run(variant, func(t *testing.T) {
			record := proxyFixture(t, variant)
			unknown := protowire.AppendString(protowire.AppendTag(nil, 999, protowire.BytesType), "future metadata")
			record.ProtoReflect().SetUnknown(unknown)
			record.RecordedAt.ProtoReflect().SetUnknown(unknown)
			event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: record})
			if err != nil {
				t.Fatal(err)
			}
			restored, err := DecodeProxyInformation(event.AuditInformation)
			if err != nil {
				t.Fatal(err)
			}
			if !proto.Equal(record, restored) {
				t.Fatal("source record lost fields, presence or unknown metadata")
			}
			if event.Source != SourceProxy || event.ResourceType != ResourceTypeEnforcementProxy || event.AuditType != AuditTypeProxyMediated || event.ResourceIdentifier != "" {
				t.Fatalf("wrong classification: %+v", event)
			}
			if event.SourceRecordID == nil || *event.SourceRecordID != record.AuditRecordId {
				t.Fatal("producer ID missing")
			}
			if event.CreatedOn != record.RecordedAt.AsTime() || event.LastModifiedOn.Before(event.CreatedOn) {
				t.Fatal("event/ingestion timestamps incorrect")
			}
			expected := OutcomeAllow
			if variant == "authorization" {
				expected = OutcomeUnknown
			}
			if event.Outcome == nil || *event.Outcome != expected {
				t.Fatalf("outcome = %v", event.Outcome)
			}
			if variant == "response" {
				if event.Success == nil || !*event.Success {
					t.Fatal("response evidence should establish transport success")
				}
			} else if event.Success != nil {
				t.Fatal("invented success without response evidence")
			}
			var exposed map[string]any
			raw, _ := json.Marshal(event)
			if err := json.Unmarshal(raw, &exposed); err != nil {
				t.Fatal(err)
			}
			if _, ok := exposed["source_record_id"]; ok {
				t.Fatal("internal producer ID was exposed")
			}
			for _, key := range []string{"mas_id", "trace_id", "span_id", "source_agent_id", "destination_agent_id"} {
				if _, ok := exposed[key]; ok {
					t.Fatalf("%s must stay in JSONB", key)
				}
			}
		})
	}
}

func TestProxyRequestEnvelopeBounds(t *testing.T) {
	for _, extra := range []int{0, 1} {
		t.Run(map[int]string{0: "at limit", 1: "over limit"}[extra], func(t *testing.T) {
			request := &api.AppendAuditRecordRequest{Record: proxyFixture(t, "mediation")}
			// Fill unknown envelope fields while keeping the embedded record small.
			// Reconstructing an envelope from Record alone would miss these bytes.
			overhead := protowire.SizeTag(999) + protowire.SizeVarint(uint64(MaxProxyRequestBytes))
			padding := make([]byte, MaxProxyRequestBytes-proto.Size(request)-overhead+extra)
			request.ProtoReflect().SetUnknown(protowire.AppendBytes(protowire.AppendTag(nil, 999, protowire.BytesType), padding))
			if size := proto.Size(request); size != MaxProxyRequestBytes+extra {
				t.Fatalf("request size=%d", size)
			}
			_, err := NewProxyAuditEvent(request)
			if extra == 0 && err != nil {
				t.Fatalf("boundary request rejected: %v", err)
			}
			if extra == 1 {
				var invalid *ValidationError
				if !errors.As(err, &invalid) {
					t.Fatalf("oversized envelope should fail validation: %v", err)
				}
			}
		})
	}
	if _, err := NewProxyAuditEvent(nil); err == nil {
		t.Fatal("nil request accepted")
	}
	if _, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{}); err == nil {
		t.Fatal("missing record accepted")
	}
	request := &api.AppendAuditRecordRequest{Record: proxyFixture(t, "mediation")}
	request.Record.Route = strings.Repeat("x", MaxProxyRequestBytes)
	if _, err := NewProxyAuditEvent(request); err == nil {
		t.Fatal("oversized record accepted")
	}
}

func TestProxyValidationAndBounds(t *testing.T) {
	cases := []struct {
		name    string
		variant string
		mutate  func(*api.AuditRecord)
	}{
		{"bad UUID", "mediation", func(r *api.AuditRecord) { r.AuditRecordId = "not-a-uuid" }},
		{"uppercase UUID", "mediation", func(r *api.AuditRecord) { r.AuditRecordId = strings.ToUpper(r.AuditRecordId) }},
		{"missing timestamp", "mediation", func(r *api.AuditRecord) { r.RecordedAt = nil }},
		{"missing trace", "mediation", func(r *api.AuditRecord) { r.TraceId = "" }},
		{"unknown enum", "mediation", func(r *api.AuditRecord) { r.AppliedOutcome = 999 }},
		{"invalid authorization application", "authorization", func(r *api.AuditRecord) { r.AppliedOutcome = api.AppliedOutcome_APPLIED_OUTCOME_ALLOWED }},
		{"own authorization link", "response", func(r *api.AuditRecord) { r.GetResponseObservation().AuthorizationRecordId = r.AuditRecordId }},
		{"reversed observation time", "response", func(r *api.AuditRecord) { r.GetResponseObservation().StartedAt.Seconds += 10 }},
		{"oversized body", "mediation", func(r *api.AuditRecord) { r.SubmittedForm.Body = make([]byte, MaxProxyFormBytes+1) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := proxyFixture(t, tc.variant)
			tc.mutate(r)
			if err := ValidateProxyRecord(r); err == nil {
				t.Fatal("invalid record accepted")
			}
		})
	}
	if err := ValidateProxyRecord(nil); err == nil {
		t.Fatal("nil record accepted")
	}
	r := proxyFixture(t, "mediation")
	r.SubmittedForm.Body = make([]byte, MaxProxyFormBytes)
	if err := ValidateProxyRecord(r); err != nil {
		t.Fatalf("valid body at boundary rejected: %v", err)
	}
	r = proxyFixture(t, "mediation")
	r.TraceId = ""
	r.SpanId = ""
	r.ReturnedDisposition = api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED
	r.AppliedOutcome = api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED
	r.UpstreamInvocation = api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED
	r.DegradationReason = "local_validation"
	if err := ValidateProxyRecord(r); err != nil {
		t.Fatalf("valid unreferenced rejection rejected: %v", err)
	}
	r = proxyFixture(t, "mediation")
	r.MasId = strings.Repeat("m", 129)
	event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: r})
	if err != nil {
		t.Fatal(err)
	}
	if event.AuditResourceIdentifier != "" || !strings.Contains(string(event.AuditInformation), r.MasId) {
		t.Fatal("long MAS association was truncated or lost")
	}
	r = proxyFixture(t, "response")
	r.GetResponseObservation().ErrorCode = "remote_error"
	if err := ValidateProxyRecord(r); err != nil {
		t.Fatal(err)
	}
	if success := ProxySuccess(r); success == nil || *success {
		t.Fatal("explicit remote error was not a failure")
	}
}

func TestProxyAppliedOutcomeProjection(t *testing.T) {
	cases := []struct {
		applied          api.AppliedOutcome
		action           api.DispositionAction
		upstream         api.UpstreamInvocationState
		reason, expected string
	}{
		{api.AppliedOutcome_APPLIED_OUTCOME_ALLOWED, api.DispositionAction_DISPOSITION_ACTION_ALLOW, api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_ATTEMPTED, "", OutcomeAllow},
		{api.AppliedOutcome_APPLIED_OUTCOME_BLOCKED, api.DispositionAction_DISPOSITION_ACTION_BLOCK, api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED, "", OutcomeBlock},
		{api.AppliedOutcome_APPLIED_OUTCOME_DEGRADED, api.DispositionAction_DISPOSITION_ACTION_UNSPECIFIED, api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED, "cf_unavailable", OutcomeDegraded},
		{api.AppliedOutcome_APPLIED_OUTCOME_UNSUPPORTED, api.DispositionAction_DISPOSITION_ACTION_MODIFY, api.UpstreamInvocationState_UPSTREAM_INVOCATION_STATE_NOT_CALLED, "modify_unsupported", OutcomeUnsupported},
	}
	for _, tc := range cases {
		r := proxyFixture(t, "mediation")
		r.AppliedOutcome = tc.applied
		r.ReturnedDisposition = tc.action
		r.UpstreamInvocation = tc.upstream
		r.DegradationReason = tc.reason
		event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: r})
		if err != nil {
			t.Fatal(err)
		}
		if event.Outcome == nil || *event.Outcome != tc.expected || event.Success != nil {
			t.Fatalf("projection or operational status incorrect: %+v", event)
		}
		restored, err := DecodeProxyInformation(event.AuditInformation)
		if err != nil || restored.AppliedOutcome != tc.applied {
			t.Fatal("original outcome changed")
		}
	}
}

func TestProxyJSONBStorageConstraints(t *testing.T) {
	for _, mutate := range []func(*api.AuditRecord){
		func(r *api.AuditRecord) { r.Route = "/nul\x00route" },
		func(r *api.AuditRecord) { r.Extra = map[string]string{"key": "nul\x00value"} },
		func(r *api.AuditRecord) { r.Extra = map[string]string{"nul\x00key": "value"} },
		func(r *api.AuditRecord) { r.SubmittedForm.ContentType = "nul\x00type" },
	} {
		record := proxyFixture(t, "mediation")
		mutate(record)
		if _, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: record}); err == nil {
			t.Fatal("accepted text that JSONB cannot persist")
		}
	}
	record := proxyFixture(t, "mediation")
	record.SubmittedForm.Body = []byte{0, 1, 2}
	record.Extra = map[string]string{"escaped": `\u0000`}
	event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: record})
	if err != nil {
		t.Fatal(err)
	}
	restored, err := DecodeProxyInformation(event.AuditInformation)
	if err != nil || !proto.Equal(record, restored) {
		t.Fatal("valid byte capture or literal escape was rejected/lost")
	}
}

func TestProxyDatabaseRetriesAndSharedOutcomeFilter(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	// Observation intentionally arrives before the authorization it references.
	for _, variant := range []string{"response", "authorization", "mediation"} {
		event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: proxyFixture(t, variant)})
		if err != nil {
			t.Fatal(err)
		}
		if err := AppendProxyAuditEvent(ctx, db, event); err != nil {
			t.Fatal(err)
		}
	}
	record := proxyFixture(t, "mediation")
	var before Audit
	if err := db.Where("source_record_id = ?", record.AuditRecordId).First(&before).Error; err != nil {
		t.Fatal(err)
	}
	failures := make(chan error, 8)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: record})
			if err == nil {
				err = AppendProxyAuditEvent(ctx, db, event)
			}
			failures <- err
		}()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	changed := proto.Clone(record).(*api.AuditRecord)
	changed.Route = "/different"
	conflict, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: changed})
	if err != nil {
		t.Fatal(err)
	}
	if err := AppendProxyAuditEvent(ctx, db, conflict); !errors.Is(err, ErrRecordConflict) {
		t.Fatalf("conflicting retry = %v", err)
	}
	var after Audit
	db.Where("source_record_id = ?", record.AuditRecordId).First(&after)
	if before.ID != after.ID || !before.CreatedOn.Equal(after.CreatedOn) || !before.LastModifiedOn.Equal(after.LastModifiedOn) {
		t.Fatal("retry mutated immutable row")
	}
	equal, err := EqualProxyInformation(before.AuditInformation, after.AuditInformation)
	if err != nil || !equal {
		t.Fatal("conflict overwrote source record")
	}
	for i := 0; i < 2; i++ {
		a := &Audit{Source: SourceCFN, ResourceType: ResourceTypeCognitionEngine, AuditType: AuditTypeCEInvoked, AuditInformation: datatypes.JSON(`{"outcome":"DECISION_ALLOW"}`)}
		if err := CreateAuditEvent(ctx, db, a); err != nil {
			t.Fatal(err)
		}
		if a.SourceRecordID != nil {
			t.Fatal("CFN producer ID should be NULL")
		}
	}
	result, err := ListAuditEvents(ctx, db, "", "", 0, 2, ListFilters{Outcome: OutcomeAllow})
	if err != nil || result.PageInfo.TotalElements != 4 || len(result.Data) != 2 {
		t.Fatalf("combined filtering/pagination: %+v %v", result, err)
	}
	legacy, err := ListAuditEvents(ctx, db, "", "", 0, 20, ListFilters{Decision: "allow"})
	if err != nil || legacy.PageInfo.TotalElements != 4 {
		t.Fatalf("legacy alias differs across producers: %+v %v", legacy, err)
	}
	all, err := ListAuditEvents(ctx, db, "", "", 0, 20)
	if err != nil || all.PageInfo.TotalElements != 5 {
		t.Fatalf("duplicates: %+v %v", all, err)
	}
}

func TestOutcomeMigrationPreservesHistoricalRecord(t *testing.T) {
	db := testDB(t)
	if err := db.Migrator().DropColumn(&Audit{}, "Outcome"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropColumn(&Audit{}, "SourceRecordID"); err != nil {
		t.Fatal(err)
	}
	created := time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC)
	cases := []struct {
		source, original, expected string
		id                         uuid.UUID
	}{
		{SourceCFN, `{"outcome":"DECISION_ALLOW","trace_id":"original"}`, OutcomeAllow, uuid.New()},
		{SourceCFN, `{"outcome":"DECISION_DENY"}`, OutcomeBlock, uuid.New()},
		{SourceCFN, `{"outcome":"DECISION_MODIFY"}`, OutcomeModifyRequested, uuid.New()},
		{SourceCFN, `{"outcome":"ERROR"}`, OutcomeError, uuid.New()},
		{SourceCFN, `{"outcome":"FUTURE"}`, OutcomeUnknown, uuid.New()},
		{SourceCFN, `{"trace_id":"no-outcome"}`, "", uuid.New()},
		{SourceCFN, `{"outcome":null}`, "", uuid.New()},
		{"CE", `{"outcome":"DECISION_DENY"}`, "", uuid.New()},
	}
	for _, tc := range cases {
		if err := db.Exec(`INSERT INTO audits (id,source,resource_type,resource_identifier,audit_type,audit_resource_identifier,audit_information,success,created_by,created_on,last_modified_by,last_modified_on)
 VALUES (?,?,?,?,?,?,?::jsonb,?,?,?,?,?)`, tc.id, tc.source, ResourceTypeCognitionEngine, "ce-1", AuditTypeCEInvoked, "mas-1", tc.original, true, uuid.Nil, created, uuid.Nil, created).Error; err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 2; i++ {
		core, logs := observer.New(zapcore.InfoLevel)
		if err := migrateUp(db, zap.New(core).Sugar()); err != nil {
			t.Fatal(err)
		}
		entries := logs.All()
		wantRows := int64(5)
		if i > 0 {
			wantRows = 0
		}
		if len(entries) != 1 || entries[0].Level != zapcore.InfoLevel ||
			entries[0].Message != "audit backfill completed" ||
			entries[0].ContextMap()["backfill"] != "cfn_disposition_outcome" ||
			entries[0].ContextMap()["rows_updated"] != wantRows {
			t.Fatalf("incorrect backfill completion log: %+v", entries)
		}
	}
	for _, tc := range cases {
		var got Audit
		if err := db.First(&got, "id = ?", tc.id).Error; err != nil {
			t.Fatal(err)
		}
		if tc.expected == "" {
			if got.Outcome != nil {
				t.Fatalf("unavailable or unrelated outcome changed: %+v", got)
			}
		} else if got.Outcome == nil || *got.Outcome != tc.expected {
			t.Fatalf("wrong projection: %+v", got)
		}
		if got.SourceRecordID != nil || got.Source != tc.source || got.Success == nil || !*got.Success || got.ResourceIdentifier != "ce-1" || got.AuditResourceIdentifier != "mas-1" || !got.CreatedOn.Equal(created) || !got.LastModifiedOn.Equal(created) {
			t.Fatalf("migration altered original entity: %+v", got)
		}
		var expected, actual any
		json.Unmarshal([]byte(tc.original), &expected)
		json.Unmarshal(got.AuditInformation, &actual)
		e, _ := json.Marshal(expected)
		a, _ := json.Marshal(actual)
		if string(e) != string(a) {
			t.Fatal("migration rewrote source JSONB")
		}
	}
}

func TestProxyConcurrentFirstSubmissions(t *testing.T) {
	for _, conflicting := range []bool{false, true} {
		t.Run(map[bool]string{false: "identical", true: "conflicting"}[conflicting], func(t *testing.T) {
			db := testDB(t)
			start := make(chan struct{})
			results := make(chan error, 12)
			var ready, done sync.WaitGroup
			ready.Add(12)
			done.Add(12)
			for i := 0; i < 12; i++ {
				record := proxyFixture(t, "mediation")
				if conflicting && i%2 == 1 {
					record.Route = "/other"
				}
				go func(r *api.AuditRecord) {
					defer done.Done()
					ready.Done()
					<-start
					event, err := NewProxyAuditEvent(&api.AppendAuditRecordRequest{Record: r})
					if err == nil {
						err = AppendProxyAuditEvent(context.Background(), db, event)
					}
					results <- err
				}(record)
			}
			ready.Wait()
			close(start)
			done.Wait()
			close(results)
			successes, conflicts := 0, 0
			for err := range results {
				switch {
				case err == nil:
					successes++
				case errors.Is(err, ErrRecordConflict):
					conflicts++
				default:
					t.Fatal(err)
				}
			}
			if conflicting {
				if successes != 6 || conflicts != 6 {
					t.Fatalf("success=%d conflict=%d", successes, conflicts)
				}
			} else if successes != 12 {
				t.Fatalf("success=%d", successes)
			}
			var count int64
			db.Model(&Audit{}).Count(&count)
			if count != 1 {
				t.Fatalf("stored %d rows", count)
			}
		})
	}
}
