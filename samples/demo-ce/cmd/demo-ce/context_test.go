// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"strings"
	"testing"
	"time"
)

func TestContextConfigReadsEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name, wait, attempts, retryWait string
		want                            contextConfig
	}{
		{"defaults", "", "", "", contextConfig{wait: time.Second, attempts: 5, retryWait: time.Second / 5}},
		{"overrides", "2s", "3", "0.1s", contextConfig{wait: 2 * time.Second, attempts: 3, retryWait: time.Second / 10}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("CE_CONTEXT_WAIT", tc.wait)
			t.Setenv("CE_CONTEXT_ATTEMPTS", tc.attempts)
			t.Setenv("CE_CONTEXT_RETRY_WAIT", tc.retryWait)
			got, err := loadContextConfig()
			if err != nil || got != tc.want {
				t.Fatalf("context configuration: got=%+v err=%v want=%+v", got, err, tc.want)
			}
		})
	}
}

func TestContextConfigRejectsInvalidValues(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"CE_CONTEXT_WAIT", "0s"}, {"CE_CONTEXT_WAIT", "-1s"}, {"CE_CONTEXT_WAIT", "26s"}, {"CE_CONTEXT_WAIT", "invalid"},
		{"CE_CONTEXT_ATTEMPTS", "0"}, {"CE_CONTEXT_ATTEMPTS", "-1"}, {"CE_CONTEXT_ATTEMPTS", "2.5"}, {"CE_CONTEXT_ATTEMPTS", "invalid"},
		{"CE_CONTEXT_RETRY_WAIT", "0s"}, {"CE_CONTEXT_RETRY_WAIT", "-1s"}, {"CE_CONTEXT_RETRY_WAIT", "invalid"},
	} {
		t.Run(tc.key+"="+tc.value, func(t *testing.T) {
			t.Setenv("CE_CONTEXT_WAIT", "1s")
			t.Setenv("CE_CONTEXT_ATTEMPTS", "5")
			t.Setenv("CE_CONTEXT_RETRY_WAIT", "0.2s")
			t.Setenv(tc.key, tc.value)
			if _, err := loadContextConfig(); err == nil || !strings.Contains(err.Error(), tc.key) {
				t.Fatalf("invalid configuration accepted: %s=%s err=%v", tc.key, tc.value, err)
			}
		})
	}
}
