// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package audit

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ioc-project/cognition-fabric/cfn/pkg/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestBackfillFailureRollsBackAndLogsError(t *testing.T) {
	for _, deferred := range []bool{false, true} {
		name := "update failure"
		if deferred {
			name = "commit failure"
		}
		t.Run(name, func(t *testing.T) {
			db := testDB(t)
			for _, outcome := range []string{"DECISION_ALLOW", "DECISION_DENY"} {
				event := &Audit{
					Source: SourceCFN, ResourceType: ResourceTypeCognitionEngine,
					AuditType:        AuditTypeCEInvoked,
					AuditInformation: datatypes.JSON(`{"outcome":"` + outcome + `"}`),
				}
				if err := CreateAuditEvent(context.Background(), db, event); err != nil {
					t.Fatal(err)
				}
			}
			if err := db.Exec("UPDATE audits SET outcome = NULL").Error; err != nil {
				t.Fatal(err)
			}
			// Reject only one of the two rows, either during UPDATE or at COMMIT.
			// Queue deferred checks on a separate table so the final audit DDL
			// can finish before PostgreSQL rejects the transaction at COMMIT.
			if deferred {
				if err := db.Exec(`CREATE FUNCTION reject_test_backfill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'audits' THEN
  INSERT INTO test_backfill_commit_check (outcome) VALUES (NEW.outcome);
 ELSIF NEW.outcome = 'BLOCK' THEN
  RAISE EXCEPTION 'test backfill row rejection' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$`).Error; err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() {
					if err := db.Exec("DROP FUNCTION reject_test_backfill() CASCADE").Error; err != nil {
						t.Errorf("clean up backfill rejection trigger: %v", err)
					}
					if err := db.Exec("DROP TABLE IF EXISTS test_backfill_commit_check").Error; err != nil {
						t.Errorf("clean up deferred backfill checks: %v", err)
					}
				})
				if err := db.Exec("CREATE TABLE test_backfill_commit_check (outcome text)").Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Exec(`CREATE CONSTRAINT TRIGGER reject_test_backfill
AFTER INSERT ON test_backfill_commit_check DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION reject_test_backfill()`).Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Exec(`CREATE TRIGGER queue_test_backfill_check
AFTER UPDATE OF outcome ON audits
FOR EACH ROW EXECUTE FUNCTION reject_test_backfill()`).Error; err != nil {
					t.Fatal(err)
				}
			} else {
				if err := db.Exec("ALTER TABLE audits ADD CONSTRAINT reject_test_backfill CHECK (outcome IS DISTINCT FROM 'BLOCK')").Error; err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() {
					if err := db.Exec("ALTER TABLE audits DROP CONSTRAINT reject_test_backfill").Error; err != nil {
						t.Errorf("clean up backfill rejection constraint: %v", err)
					}
				})
			}
			core, logs := observer.New(zapcore.InfoLevel)
			if err := migrateUp(db, zap.New(core).Sugar()); err == nil {
				t.Fatal("expected migration to fail when one row is rejected")
			} else if !deferred && !strings.Contains(err.Error(), "backfill CFN disposition audit outcomes") {
				t.Fatalf("missing backfill error context: %v", err)
			} else if deferred && !strings.Contains(err.Error(), "test backfill row rejection") {
				t.Fatalf("expected deferred commit rejection, got: %v", err)
			}
			entries := logs.All()
			if len(entries) != 1 || entries[0].Level != zapcore.ErrorLevel ||
				entries[0].Message != "audit migration failed" ||
				entries[0].ContextMap()["backfill"] != "cfn_disposition_outcome" ||
				entries[0].ContextMap()["error"] == nil {
				t.Fatalf("expected only a backfill error log, got %+v", entries)
			}
			var unchanged int64
			if err := db.Model(&Audit{}).Where("outcome IS NULL").Count(&unchanged).Error; err != nil {
				t.Fatal(err)
			}
			if unchanged != 2 {
				t.Fatalf("backfill partially committed: only %d of 2 rows remain unchanged", unchanged)
			}
		})
	}
}

func TestConcurrentMigrations(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "fresh schema, commit releases lock"
		if legacy {
			name = "legacy schema, rollback releases lock"
		}
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			cfg := config.DatabaseFromEnv()
			cfg.Name = getEnvOrDefault("POSTGRES_TEST_DB", "cfn_audit_test")
			admin, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{})
			if err != nil {
				t.Skipf("no test PostgreSQL reachable: %v", err)
			}
			adminSQL, err := admin.DB()
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { adminSQL.Close() })
			schema := "migration_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			if err := admin.WithContext(ctx).Exec("CREATE SCHEMA " + schema).Error; err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
					t.Errorf("clean up migration schema: %v", err)
				}
			})
			openNode := func(applicationName string) *gorm.DB {
				node, err := gorm.Open(postgres.Open(cfg.DSN()+" search_path="+schema+" application_name="+applicationName), &gorm.Config{})
				if err != nil {
					t.Fatal(err)
				}
				pool, err := node.DB()
				if err != nil {
					t.Fatal(err)
				}
				pool.SetMaxOpenConns(1)
				pool.SetMaxIdleConns(1)
				t.Cleanup(func() { pool.Close() })
				return node.WithContext(ctx)
			}
			originalID := uuid.New()
			recorded := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
			if legacy {
				setup := openNode(schema + "_setup")
				if err := MigrateUp(setup); err != nil {
					t.Fatal(err)
				}
				for _, column := range []string{"Outcome", "SourceRecordID"} {
					if err := setup.Migrator().DropColumn(&Audit{}, column); err != nil {
						t.Fatal(err)
					}
				}
				if err := setup.Exec(`INSERT INTO audits
     (id,source,resource_type,resource_identifier,audit_type,audit_resource_identifier,audit_information,success,created_by,created_on,last_modified_by,last_modified_on)
     VALUES (?,?,?,?,?,?,?::jsonb,?,?,?,?,?)`,
					originalID, SourceCFN, ResourceTypeCognitionEngine, "ce-original", AuditTypeCEInvoked, "mas-original",
					`{"outcome":"DECISION_DENY","trace_id":"original-trace"}`, true, uuid.Nil, recorded, uuid.Nil, recorded).Error; err != nil {
					t.Fatal(err)
				}
			}

			// Queue real MigrateUp calls behind an independent connection holding
			// the production key. This makes overlap deterministic, not a sleep race.
			blocker := admin.WithContext(ctx).Begin()
			if blocker.Error != nil {
				t.Fatal(blocker.Error)
			}
			defer blocker.Rollback()
			if err := blocker.Exec("SELECT pg_advisory_xact_lock(?)", auditMigrationLockKey).Error; err != nil {
				t.Fatal(err)
			}
			const nodes = 4
			applicationName := schema + "_nodes"
			results := make(chan error, nodes)
			for i := 0; i < nodes; i++ {
				node := openNode(applicationName)
				go func(db *gorm.DB) { results <- MigrateUp(db) }(node)
			}
			ticker := time.NewTicker(10 * time.Millisecond)
			defer ticker.Stop()
			for {
				var waiting int64
				err := admin.WithContext(ctx).Raw(`SELECT count(*) FROM pg_locks l
     JOIN pg_stat_activity a ON a.pid=l.pid
     WHERE l.locktype='advisory' AND NOT l.granted AND a.application_name=?`, applicationName).Scan(&waiting).Error
				if err != nil {
					t.Fatal(err)
				}
				if waiting == nodes {
					break
				}
				select {
				case err := <-results:
					t.Fatalf("migration finished before lock release: %v", err)
				case <-ctx.Done():
					t.Fatalf("only %d/%d migrations waited on the advisory lock: %v", waiting, nodes, ctx.Err())
				case <-ticker.C:
				}
			}
			// Confirm the committed schema has not changed while callers wait.
			// The waiter count above establishes that they are blocked on this lock.
			var columns int64
			if err := admin.WithContext(ctx).Raw(`SELECT count(*) FROM information_schema.columns
    WHERE table_schema=? AND table_name='audits'
    AND column_name IN ('outcome','source_record_id')`, schema).Scan(&columns).Error; err != nil {
				t.Fatal(err)
			}
			if columns != 0 {
				t.Fatal("schema changed before the migration lock was acquired")
			}
			if legacy {
				err = blocker.Rollback().Error
			} else {
				err = blocker.Commit().Error
			}
			if err != nil {
				t.Fatal(err)
			}
			for i := 0; i < nodes; i++ {
				select {
				case err := <-results:
					if err != nil {
						t.Fatalf("concurrent migration failed: %v", err)
					}
				case <-ctx.Done():
					t.Fatalf("migration did not finish: %v", ctx.Err())
				}
			}
			if err := admin.WithContext(ctx).Raw(`SELECT count(*) FROM information_schema.columns
    WHERE table_schema=? AND table_name='audits'
    AND column_name IN ('outcome','source_record_id')`, schema).Scan(&columns).Error; err != nil {
				t.Fatal(err)
			}
			if columns != 2 {
				t.Fatalf("expected two new columns, got %d", columns)
			}
			var indexes int64
			if err := admin.WithContext(ctx).Raw(`SELECT count(*) FROM pg_indexes
    WHERE schemaname=? AND indexname='idx_audits_source_record'
    AND indexdef LIKE 'CREATE UNIQUE INDEX%'`, schema).Scan(&indexes).Error; err != nil {
				t.Fatal(err)
			}
			if indexes != 1 {
				t.Fatalf("expected one unique producer index, got %d", indexes)
			}
			if legacy {
				var got Audit
				if err := admin.WithContext(ctx).Table(schema+".audits").First(&got, "id = ?", originalID).Error; err != nil {
					t.Fatal(err)
				}
				if got.Outcome == nil || *got.Outcome != OutcomeBlock || got.SourceRecordID != nil ||
					got.ResourceIdentifier != "ce-original" || got.AuditResourceIdentifier != "mas-original" ||
					got.Success == nil || !*got.Success || !got.CreatedOn.Equal(recorded) || !got.LastModifiedOn.Equal(recorded) ||
					!strings.Contains(string(got.AuditInformation), "DECISION_DENY") || !strings.Contains(string(got.AuditInformation), "original-trace") {
					t.Fatalf("historical audit changed during concurrent migration: %+v", got)
				}
			}
		})
	}
}
