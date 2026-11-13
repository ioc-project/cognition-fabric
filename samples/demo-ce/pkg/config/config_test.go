// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"strings"
	"testing"
)

func TestConfigRejectsUnsafeConfiguration(t *testing.T) {
	for _, body := range []string{`{"rules":[]}`, `{"rules":[{"id":"X","effect":"ALLOW","reason":"all"}]}`, `{"rules":[{"id":"X","effect":"ALLOW","reason":"ok","sources":["moderator"]}],"content":true}`} {
		if _, err := Decode(strings.NewReader(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}
