// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// A config file is either one config (rules/content_rules at the top level, bound to the MAS in CE_MAS_FILE)
// or a list of per-MAS configs:
//
//	{"mas": [{"mas_id": "mas-a", "rules": [...], "content_rules": [...]}, {"mas_id": "mas-b", ...}]}
type MasConfig struct {
	MasID string `json:"mas_id"`
	Config
}

// Set is the decoded config file. Exactly one of Single and ByMAS is set.
type Set struct {
	Single *Config
	ByMAS  map[string]Config
	Order  []string
}

func DecodeSet(r io.Reader) (Set, error) {
	raw, err := io.ReadAll(io.LimitReader(r, 1<<20+1))
	if err != nil {
		return Set{}, err
	}
	if len(raw) > 1<<20 {
		return Set{}, fmt.Errorf("config file exceeds 1 MiB")
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return Set{}, err
	}
	list, multi := top["mas"]
	if !multi {
		p, err := Decode(bytes.NewReader(raw))
		return Set{Single: &p}, err
	}
	if len(top) != 1 {
		return Set{}, fmt.Errorf(`a config file with "mas" must hold nothing else at the top level`)
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(list, &entries); err != nil || len(entries) == 0 {
		return Set{}, fmt.Errorf(`"mas" must be a non-empty list`)
	}
	set := Set{ByMAS: map[string]Config{}}
	for n, e := range entries {
		var m MasConfig
		d := json.NewDecoder(bytes.NewReader(e))
		d.DisallowUnknownFields()
		if err := d.Decode(&m); err != nil {
			return Set{}, fmt.Errorf("mas[%d]: %w", n, err)
		}
		if m.MasID == "" {
			return Set{}, fmt.Errorf("mas[%d]: mas_id required", n)
		}
		if _, dup := set.ByMAS[m.MasID]; dup {
			return Set{}, fmt.Errorf("mas[%d]: duplicate mas_id %q", n, m.MasID)
		}
		p, err := finishConfig(m.Config)
		if err != nil {
			return Set{}, fmt.Errorf("mas %q: %w", m.MasID, err)
		}
		set.ByMAS[m.MasID] = p
		set.Order = append(set.Order, m.MasID)
	}
	return set, nil
}

func (s Set) RuleCounts() (identity, content int) {
	count := func(p Config) { identity += len(p.Rules); content += len(p.ContentRules) }
	if s.Single != nil {
		count(*s.Single)
	}
	for _, p := range s.ByMAS {
		count(p)
	}
	return
}
