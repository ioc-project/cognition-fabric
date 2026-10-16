package policy

import (
	"os"
	"strings"
	"testing"
)

func TestExamplePolicyIsMultiMAS(t *testing.T) {
	f, err := os.Open("../../examples/policy.json")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	set, err := DecodeSet(f, ProfileTopology)
	if err != nil || set.Single != nil || len(set.ByMAS) != 2 || set.Order[0] != "mas-a" {
		t.Fatalf("set=%+v err=%v", set, err)
	}
}

func TestSinglePolicyKeepsTheLegacyShape(t *testing.T) {
	set, err := DecodeSet(strings.NewReader(`{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}]}`), ProfileTopology)
	if err != nil || set.Single == nil || len(set.ByMAS) != 0 {
		t.Fatalf("set=%+v err=%v", set, err)
	}
}

func TestPolicySetRejectsInvalidFiles(t *testing.T) {
	rule := `"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}]`
	for name, body := range map[string]string{
		"missing mas_id":  `{"mas":[{` + rule + `}]}`,
		"duplicate mas":   `{"mas":[{"mas_id":"m",` + rule + `},{"mas_id":"m",` + rule + `}]}`,
		"empty list":      `{"mas":[]}`,
		"mixed top level": `{"mas":[{"mas_id":"m",` + rule + `}],` + rule + `}`,
		"unknown field":   `{"mas":[{"mas_id":"m","extra":1,` + rule + `}]}`,
		"invalid rules":   `{"mas":[{"mas_id":"m","rules":[]}]}`,
	} {
		if _, err := DecodeSet(strings.NewReader(body), ProfileTopology); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestUsesToolInputOnlyForTopologyRules(t *testing.T) {
	body := `{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence":"%s"}]}`
	for evidence, want := range map[string]bool{"tool_input": true, "mcp_tool_input": false, "llm_input": false, "a2a_message_input": false} {
		set, err := DecodeSet(strings.NewReader(strings.Replace(body, "%s", evidence, 1)), ProfileTopology)
		if err != nil || set.UsesToolInput() != want {
			t.Errorf("%s: uses=%v err=%v", evidence, set.UsesToolInput(), err)
		}
	}
	// A rule that only applies in the events profile does not need OXP in the topology profile.
	set, err := DecodeSet(strings.NewReader(`{"rules":[{"id":"A","effect":"ALLOW","reason":"r","sources":["s"]}],"content_rules":[{"id":"C","reason":"r","pattern":"x","destinations":["d"],"evidence_by_profile":{"topology":"tool_input","events":"llm_input"}}]}`), ProfileEvents)
	if err != nil || set.UsesToolInput() {
		t.Errorf("events profile: uses=%v err=%v", set.UsesToolInput(), err)
	}
}
