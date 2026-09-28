// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

// Package config holds cfn-svc configuration loaded from the environment.
package config

import (
	"fmt"
	"os"
	"strings"
)

// Database holds PostgreSQL connection settings.
type Database struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// DSN returns the PostgreSQL connection string for this configuration.
// Every value is quoted so a space/quote/backslash in a password or user
// doesn't break libpq's keyword/value parsing.
func (d Database) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		quoteConnInfoValue(d.Host), quoteConnInfoValue(d.Port), quoteConnInfoValue(d.User),
		quoteConnInfoValue(d.Password), quoteConnInfoValue(d.Name), quoteConnInfoValue(d.SSLMode))
}

// quoteConnInfoValue quotes a libpq conninfo value, escaping backslashes and
// single quotes within it per the keyword/value connection string format.
func quoteConnInfoValue(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `'`, `\'`)
	return "'" + v + "'"
}

// DatabaseFromEnv loads database configuration from POSTGRES_* environment
// variables. The database name uses POSTGRES_AUDIT_DB rather than the more
// generic POSTGRES_DB, since other services sharing the same Postgres
// instance (e.g. mgmt-svc) set their own POSTGRES_DB to a different value.
func DatabaseFromEnv() Database {
	return Database{
		Host:     getEnvOrDefault("POSTGRES_HOST", "localhost"),
		Port:     getEnvOrDefault("POSTGRES_PORT", "5432"),
		User:     getEnvOrDefault("POSTGRES_USER", "postgres"),
		Password: getEnvOrDefault("POSTGRES_PASSWORD", "postgres"),
		Name:     getEnvOrDefault("POSTGRES_AUDIT_DB", "cfn_audit"),
		SSLMode:  getEnvOrDefault("POSTGRES_SSLMODE", "disable"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
