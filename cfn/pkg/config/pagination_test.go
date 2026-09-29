// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"os"
	"testing"
)

func TestPaginationFromEnv_Unset(t *testing.T) {
	os.Unsetenv("DEFAULT_PAGE_SIZE")
	os.Unsetenv("MAX_PAGE_SIZE")

	p := PaginationFromEnv()
	if p.DefaultPageSize != 0 || p.MaxPageSize != 0 {
		t.Errorf("expected zero values when unset, got %+v", p)
	}
}

func TestPaginationFromEnv_Set(t *testing.T) {
	t.Setenv("DEFAULT_PAGE_SIZE", "10")
	t.Setenv("MAX_PAGE_SIZE", "50")

	p := PaginationFromEnv()
	if p.DefaultPageSize != 10 || p.MaxPageSize != 50 {
		t.Errorf("expected {10 50}, got %+v", p)
	}
}

func TestPaginationFromEnv_Invalid(t *testing.T) {
	t.Setenv("DEFAULT_PAGE_SIZE", "not-a-number")

	p := PaginationFromEnv()
	if p.DefaultPageSize != 0 {
		t.Errorf("expected invalid value to fall back to 0, got %d", p.DefaultPageSize)
	}
}
