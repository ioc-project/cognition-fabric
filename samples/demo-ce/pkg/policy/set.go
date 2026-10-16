package policy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// A policy file is either one policy (rules/content_rules at the top level, bound to the MAS in CE_MAS_FILE)
// or a list of per-MAS policies:
//
//	{"mas": [{"mas_id": "mas-a", "rules": [...], "content_rules": [...]}, {"mas_id": "mas-b", ...}]}
type MasPolicy struct {
	MasID string `json:"mas_id"`
	Policy
}

// Set is the decoded policy file. Exactly one of Single and ByMAS is set.
type Set struct {
	Single *Policy
	ByMAS  map[string]Policy
	Order  []string
}

func DecodeSet(r io.Reader, profile string) (Set, error) {
	raw, err := io.ReadAll(io.LimitReader(r, 1<<20+1))
	if err != nil {
		return Set{}, err
	}
	if len(raw) > 1<<20 {
		return Set{}, fmt.Errorf("policy file exceeds 1 MiB")
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return Set{}, err
	}
	list, multi := top["mas"]
	if !multi {
		p, err := DecodeFor(bytes.NewReader(raw), profile)
		return Set{Single: &p}, err
	}
	if len(top) != 1 {
		return Set{}, fmt.Errorf(`a policy file with "mas" must hold nothing else at the top level`)
	}
	var entries []json.RawMessage
	if err := json.Unmarshal(list, &entries); err != nil || len(entries) == 0 {
		return Set{}, fmt.Errorf(`"mas" must be a non-empty list`)
	}
	set := Set{ByMAS: map[string]Policy{}}
	for n, e := range entries {
		var m MasPolicy
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
		p, err := finishPolicy(m.Policy, profile)
		if err != nil {
			return Set{}, fmt.Errorf("mas %q: %w", m.MasID, err)
		}
		set.ByMAS[m.MasID] = p
		set.Order = append(set.Order, m.MasID)
	}
	return set, nil
}

// UsesToolInput reports whether any content rule that applies reads the session topology from OXP.
func (s Set) UsesToolInput() bool {
	uses := func(p Policy) bool {
		for _, r := range p.ContentRules {
			if r.Evidence == EvidenceToolInput {
				return true
			}
		}
		return false
	}
	if s.Single != nil && uses(*s.Single) {
		return true
	}
	for _, p := range s.ByMAS {
		if uses(p) {
			return true
		}
	}
	return false
}

func (s Set) RuleCounts() (identity, content int) {
	count := func(p Policy) { identity += len(p.Rules); content += len(p.ContentRules) }
	if s.Single != nil {
		count(*s.Single)
	}
	for _, p := range s.ByMAS {
		count(p)
	}
	return
}
