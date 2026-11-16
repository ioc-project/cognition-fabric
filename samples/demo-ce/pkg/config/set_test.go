// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"os"
	"strings"
	"testing"
)

func TestExampleConfigIsMultiMAS(t *testing.T) {
	f, err := os.Open("../../config/config.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	set, err := DecodeSet(f)
	if err != nil || set.Single != nil || len(set.ByMAS) != 2 || set.Order[0] != "mas-a" {
		t.Fatalf("set=%+v err=%v", set, err)
	}
}

func TestSingleConfigKeepsTheLegacyShape(t *testing.T) {
	set, err := DecodeSet(strings.NewReader(`{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}]}`))
	if err != nil || set.Single == nil || len(set.ByMAS) != 0 {
		t.Fatalf("set=%+v err=%v", set, err)
	}
}

func TestConfigSetRejectsInvalidFiles(t *testing.T) {
	rule := `"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}]`
	for name, body := range map[string]string{
		"missing mas_id":  `{"mas":[{` + rule + `}]}`,
		"duplicate mas":   `{"mas":[{"mas_id":"m",` + rule + `},{"mas_id":"m",` + rule + `}]}`,
		"empty list":      `{"mas":[]}`,
		"mixed top level": `{"mas":[{"mas_id":"m",` + rule + `}],` + rule + `}`,
		"unknown field":   `{"mas":[{"mas_id":"m","extra":1,` + rule + `}]}`,
		"invalid rules":   `{"mas":[{"mas_id":"m","rules":[]}]}`,
	} {
		if _, err := DecodeSet(strings.NewReader(body)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
