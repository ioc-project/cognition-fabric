// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"os"
	"strconv"
)

// Pagination holds configurable audit-listing pagination defaults.
type Pagination struct {
	DefaultPageSize int
	MaxPageSize     int
}

// PaginationFromEnv loads pagination configuration from the DEFAULT_PAGE_SIZE
// and MAX_PAGE_SIZE environment variables. Invalid or unset values fall back
// to 0, which audit.SetPaginationConfig treats as "keep the built-in default".
func PaginationFromEnv() Pagination {
	return Pagination{
		DefaultPageSize: getEnvIntOrZero("DEFAULT_PAGE_SIZE"),
		MaxPageSize:     getEnvIntOrZero("MAX_PAGE_SIZE"),
	}
}

func getEnvIntOrZero(key string) int {
	val, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return 0
	}
	return val
}
