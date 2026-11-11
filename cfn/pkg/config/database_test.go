// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"os"
	"testing"
)

func TestDatabase_DSN(t *testing.T) {
	d := Database{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: "secret",
		Name:     "cfn_audit",
		SSLMode:  "disable",
	}

	want := "host='localhost' port='5432' user='postgres' password='secret' dbname='cfn_audit' sslmode='disable' TimeZone=UTC"
	if got := d.DSN(); got != want {
		t.Errorf("DSN() = %q, want %q", got, want)
	}
}

func TestDatabase_DSN_EscapesSpecialCharacters(t *testing.T) {
	d := Database{
		Host:     "localhost",
		Port:     "5432",
		User:     "postgres",
		Password: `p'a\ss word`,
		Name:     "cfn_audit",
		SSLMode:  "disable",
	}

	want := `host='localhost' port='5432' user='postgres' password='p\'a\\ss word' dbname='cfn_audit' sslmode='disable' TimeZone=UTC`
	if got := d.DSN(); got != want {
		t.Errorf("DSN() = %q, want %q", got, want)
	}
}

func TestDatabaseFromEnv_Defaults(t *testing.T) {
	for _, key := range []string{"POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_AUDIT_DB", "POSTGRES_SSLMODE"} {
		os.Unsetenv(key)
	}

	d := DatabaseFromEnv()

	if d.Host != "localhost" {
		t.Errorf("Host = %q, want %q", d.Host, "localhost")
	}
	if d.Port != "5432" {
		t.Errorf("Port = %q, want %q", d.Port, "5432")
	}
	if d.Name != "cfn_audit" {
		t.Errorf("Name = %q, want %q", d.Name, "cfn_audit")
	}
	if d.SSLMode != "disable" {
		t.Errorf("SSLMode = %q, want %q", d.SSLMode, "disable")
	}
}

func TestDatabaseFromEnv_Overrides(t *testing.T) {
	t.Setenv("POSTGRES_HOST", "ioc-scale-db")
	t.Setenv("POSTGRES_PORT", "5433")
	t.Setenv("POSTGRES_AUDIT_DB", "custom_db")

	d := DatabaseFromEnv()

	if d.Host != "ioc-scale-db" {
		t.Errorf("Host = %q, want %q", d.Host, "ioc-scale-db")
	}
	if d.Port != "5433" {
		t.Errorf("Port = %q, want %q", d.Port, "5433")
	}
	if d.Name != "custom_db" {
		t.Errorf("Name = %q, want %q", d.Name, "custom_db")
	}
}
