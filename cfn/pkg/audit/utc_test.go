// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const utcTestEvidence = `{"ce_response":{"timestamp":"2026-11-11T14:00:00+02:00","details":{"timestamp":"unparsed CE evidence","number":123456789012345678901234567890}}}`

func assertUTCAuditJSON(t *testing.T, value any, created, modified time.Time) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		CreatedOn      string          `json:"created_on"`
		LastModifiedOn string          `json:"last_modified_on"`
		Information    json.RawMessage `json:"audit_information"`
	}
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	for name, pair := range map[string][2]string{
		"created_on":       {result.CreatedOn, created.UTC().Format(time.RFC3339Nano)},
		"last_modified_on": {result.LastModifiedOn, modified.UTC().Format(time.RFC3339Nano)},
	} {
		if pair[0] != pair[1] || !strings.HasSuffix(pair[0], "Z") {
			t.Errorf("%s = %q, want %q", name, pair[0], pair[1])
		}
	}
	var evidence struct {
		CE struct {
			Timestamp string `json:"timestamp"`
			Details   struct {
				Timestamp string          `json:"timestamp"`
				Number    json.RawMessage `json:"number"`
			} `json:"details"`
		} `json:"ce_response"`
	}
	if err := json.Unmarshal(result.Information, &evidence); err != nil {
		t.Fatal(err)
	}
	if evidence.CE.Timestamp != "2026-11-11T14:00:00+02:00" || evidence.CE.Details.Timestamp != "unparsed CE evidence" ||
		string(evidence.CE.Details.Number) != "123456789012345678901234567890" {
		t.Fatalf("producer evidence changed: %s", result.Information)
	}
}

func TestAuditJSONNormalizesOnlyOwnedTimestamps(t *testing.T) {
	local := time.FixedZone("UTC+05:45", 5*3600+45*60)
	created := time.Date(2026, 11, 11, 14, 15, 16, 123456000, local)
	modified := created.Add(time.Minute)
	event := Audit{CreatedOn: created, LastModifiedOn: modified, AuditInformation: datatypes.JSON(utcTestEvidence)}
	assertUTCAuditJSON(t, event, created, modified)
	assertUTCAuditJSON(t, &event, created, modified)
	if event.CreatedOn != created || event.LastModifiedOn != modified || string(event.AuditInformation) != utcTestEvidence {
		t.Fatal("serialization mutated the stored event")
	}
	encoded, err := json.Marshal(AuditListResponse{Data: []Audit{event}})
	if err != nil {
		t.Fatal(err)
	}
	var page struct {
		Data []json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(encoded, &page); err != nil || len(page.Data) != 1 {
		t.Fatalf("invalid audit page: %s (%v)", encoded, err)
	}
	assertUTCAuditJSON(t, page.Data[0], created, modified)
}

func TestAuditDatabaseRoundTripUTCWithNonUTCHost(t *testing.T) {
	originalLocal := time.Local
	time.Local = time.FixedZone("UTC-08", -8*3600)
	t.Cleanup(func() { time.Local = originalLocal })
	db := testDB(t)
	var sessionZone string
	if err := db.Raw("SHOW TIMEZONE").Scan(&sessionZone).Error; err != nil {
		t.Fatal(err)
	}
	if sessionZone != "UTC" {
		t.Fatalf("database session timezone = %q", sessionZone)
	}
	event := &Audit{
		Source: SourceCFN, ResourceType: ResourceTypeCognitionEngine,
		ResourceIdentifier: "utc-ce", AuditType: AuditTypeCEInvoked,
		AuditResourceIdentifier: "utc-mas", CreatedBy: uuid.New(), LastModifiedBy: uuid.New(),
		AuditInformation: datatypes.JSON(utcTestEvidence),
	}
	if err := CreateAuditEvent(context.Background(), db, event); err != nil {
		t.Fatal(err)
	}
	if event.CreatedOn.Location() != time.UTC || event.LastModifiedOn.Location() != time.UTC {
		t.Fatal("new CFN audit timestamps are not UTC")
	}
	got, err := GetAuditEventByID(context.Background(), db, event.ID)
	if err != nil {
		t.Fatal(err)
	}
	// PostgreSQL stores microsecond precision; the instant must not shift with
	// either the local scan location or the JSON representation.
	if delta := got.CreatedOn.Sub(event.CreatedOn); delta < -time.Microsecond || delta > time.Microsecond {
		t.Fatalf("database shifted the recorded instant by %s", delta)
	}
	assertUTCAuditJSON(t, got, got.CreatedOn, got.LastModifiedOn)
	page, err := ListAuditEvents(context.Background(), db.Where("id = ?", event.ID), "", "", 0, 10)
	if err != nil || len(page.Data) != 1 {
		t.Fatalf("list audit events: %v", err)
	}
	assertUTCAuditJSON(t, page.Data[0], got.CreatedOn, got.LastModifiedOn)
}
