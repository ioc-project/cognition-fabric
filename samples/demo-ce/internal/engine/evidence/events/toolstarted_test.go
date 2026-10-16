package events

import (
	"encoding/json"
	"reflect"
	"sort"
	"testing"
)

func TestToolEventReadsEveryStringOfTheArguments(t *testing.T) {
	for name, input := range map[string]string{
		"object": `{"query":"a","nested":{"b":["c",""]}}`,
		"string": `"{\"query\":\"a\",\"nested\":{\"b\":[\"c\",\"\"]}}"`,
	} {
		raw := json.RawMessage(`{"type":"tool.started","session":{"id":"s1"},"data":{"tool":{"name":"t","call_id":"m1"},"input":` + input + `}}`)
		session, callID, texts, ok := ToolEvent(raw)
		var got []string
		for _, text := range texts {
			got = append(got, text.Text)
		}
		sort.Strings(got)
		if !ok || session != "s1" || callID != "m1" || !reflect.DeepEqual(got, []string{"a", "c"}) {
			t.Errorf("%s: ok=%v session=%q call=%q texts=%v", name, ok, session, callID, got)
		}
	}
}

func TestOtherEventsAreNotToolEvidence(t *testing.T) {
	for _, raw := range []string{
		`{"type":"llm.started","data":{"tool":{"name":"t"},"input":{"a":"b"}}}`,
		`{"type":"tool.started","data":{"tool":{"name":""},"input":{"a":"b"}}}`,
		`{"type":"tool.started","data":{"tool":{"name":"t"}}}`,
	} {
		if _, _, _, ok := ToolEvent(json.RawMessage(raw)); ok {
			t.Errorf("accepted %s", raw)
		}
	}
}
