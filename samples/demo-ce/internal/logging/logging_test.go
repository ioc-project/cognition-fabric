// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package logging

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestOutputModesAndLevels(t *testing.T) {
	for _, tc := range []struct {
		format        string
		noColor, ansi bool
	}{{"console", false, true}, {"console", true, false}, {"json", false, false}} {
		var out bytes.Buffer
		logger, err := New(&out, tc.format, "info", tc.noColor)
		if err != nil {
			t.Fatal(err)
		}
		logger.Info("decision", "outcome", "DENY")
		logger.Debug("hidden")
		if strings.Contains(out.String(), "\x1b[") != tc.ansi {
			t.Fatalf("color mode: %q", out.String())
		}
		if strings.Contains(out.String(), "hidden") {
			t.Fatal("debug ignores configured level")
		}
		if tc.format == "json" {
			var row map[string]any
			if json.Unmarshal(out.Bytes(), &row) != nil || row["component"] != "demo-ce" {
				t.Fatalf("invalid structured output: %s", out.String())
			}
		}
	}
}

func TestRejectsInvalidLoggingConfiguration(t *testing.T) {
	for _, tc := range []struct{ format, level string }{{"typo", "info"}, {"console", "typo"}} {
		if _, err := New(&bytes.Buffer{}, tc.format, tc.level, false); err == nil {
			t.Fatal("invalid logging configuration accepted")
		}
	}
}
