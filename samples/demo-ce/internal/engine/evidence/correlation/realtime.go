package correlation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"reflect"
	"sort"

	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/engine/evidence/events"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/oxp"
	"github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/pkg/policy"
	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
)

// Keys of the request's extra map that name the pre-call event. The CFN passes them from the proxy, which
// reads them from the carrier of the intercepted request.
const (
	// ExtraPrecallEventID is the event.id of the tool.started event that holds the content: read directly.
	ExtraPrecallEventID = "ioc.observe.precall_event_id"
	// ExtraEventID is the id of the message.sent event, parent of the tool.started that holds the content.
	ExtraEventID = "ioc.observe.event_id"
)

type realtimeState int

const (
	realtimeNone    realtimeState = iota // no reference in the request, or the endpoint failed: use the inbox
	realtimePending                      // referenced, but OXP does not expose the event yet
	realtimeFound
)

// hasRealtimeRef reports whether the request can be resolved through OXP realtime: a model request always
// can (its span holds the llm.started event), the others when they name their pre-call event.
func (j *Judge) hasRealtimeRef(r *cev1.EvaluateRequest) bool {
	if j.Client == nil {
		return false
	}
	return j.Kind == policy.EvidenceLLMInput || r.Extra[ExtraPrecallEventID] != "" || r.Extra[ExtraEventID] != ""
}

// realtime resolves the pre-call tool.started event through the OXP realtime endpoints. The direct id wins;
// otherwise the span's tool.started events are searched for the one whose parent is the carrier's event.id.
// The returned error means the reference is contradictory (wrong trace, span or message, or ambiguous
// candidates), which is never retried. An endpoint failure is reported as realtimeNone.
func (j *Judge) realtime(ctx context.Context, r *cev1.EvaluateRequest) (*currentEvent, realtimeState, error) {
	if !j.hasRealtimeRef(r) {
		return nil, realtimeNone, nil
	}
	if j.Kind == policy.EvidenceLLMInput {
		return j.realtimeModel(ctx, r)
	}
	if id := r.Extra[ExtraPrecallEventID]; id != "" {
		event, err := j.Client.Event(ctx, id)
		if err != nil {
			return j.realtimeFailure(r, "event", err)
		}
		current, err := j.realtimeCandidate(r, event)
		if err != nil {
			return nil, realtimeNone, err
		}
		current.via = "direct event " + id
		return current, realtimeFound, nil
	}
	parent := r.Extra[ExtraEventID]
	if j.Kind != policy.EvidenceToolInput {
		// The carrier's event is the message.sent. From Observe SDK 1.0.57 it holds the content itself.
		sent, err := j.Client.Event(ctx, parent)
		if err != nil {
			return j.realtimeFailure(r, "event", err)
		}
		current, err := j.messageSentCandidate(r, sent)
		if err != nil {
			return nil, realtimeNone, err
		}
		if current != nil {
			current.via = sent.Type + " " + parent
			return current, realtimeFound, nil
		}
		// Without content in the message.sent, look for the tool.started that is its child.
	}
	list, err := j.Client.SpanEvents(ctx, r.SpanId, "tool.started")
	if err != nil {
		return j.realtimeFailure(r, "span_events", err)
	}
	var selected *currentEvent
	for _, event := range list {
		if event.ParentID != parent || event.TraceID != r.TraceId {
			continue
		}
		candidate, err := j.realtimeCandidate(r, event)
		if err != nil {
			return nil, realtimeNone, err
		}
		if selected != nil && !reflect.DeepEqual(selected.texts, candidate.texts) {
			return nil, realtimeNone, errors.New("conflicting pre-call inputs for the carrier event")
		}
		candidate.via = "tool.started child of event " + parent
		selected = candidate
	}
	if selected == nil {
		return nil, realtimePending, nil
	}
	return selected, realtimeFound, nil
}

func (j *Judge) realtimeFailure(r *cev1.EvaluateRequest, what string, err error) (*currentEvent, realtimeState, error) {
	switch {
	case errors.Is(err, oxp.ErrEventPending):
		return nil, realtimePending, nil
	case errors.Is(err, oxp.ErrInvalidContext):
		return nil, realtimeNone, err
	}
	// The endpoint is unavailable: keep the behavior without it.
	log.Printf("flow component=policy-ce event=oxp_realtime trace_id=%s span_id=%s lookup=%s available=false err=%q", r.TraceId, r.SpanId, what, err)
	return nil, realtimeNone, nil
}

func (j *Judge) realtimeCandidate(r *cev1.EvaluateRequest, event oxp.RealtimeEvent) (*currentEvent, error) {
	if event.Type != "tool.started" {
		return nil, fmt.Errorf("referenced event is %s, not tool.started", event.Type)
	}
	if event.TraceID != r.TraceId || event.SpanID != r.SpanId {
		return nil, errors.New("referenced pre-call event belongs to a different trace or span")
	}
	session, callID, texts, ok := events.ToolEvent(event.Raw)
	if !ok {
		return nil, errors.New("referenced pre-call event has no tool input")
	}
	if want := r.Extra["ioc.observe.message_id"]; j.Kind == policy.EvidenceA2AMessageInput && want != "" && callID != "" && want != callID {
		return nil, errors.New("referenced pre-call event belongs to a different message")
	}
	sortTexts(texts)
	return &currentEvent{session: session, texts: texts, realtime: true}, nil
}

func realtimeCheck(out *cev1.EvaluateResponse, via string) {
	out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_REALTIME_EVENT", Passed: true, Reason: "pre-call input read from OXP realtime: " + via})
}

// realtimeModel resolves a model request by its span alone: the span has exactly one llm.started event, whose
// input is the prompt. No event leaves the request to the inbox and the span fallback, and more than one is
// ambiguous: the CE does not pick one.
func (j *Judge) realtimeModel(ctx context.Context, r *cev1.EvaluateRequest) (*currentEvent, realtimeState, error) {
	list, err := j.Client.SpanEvents(ctx, r.SpanId, "llm.started")
	if err != nil {
		// A model request is never required to be in realtime: any failure of the endpoint, including a
		// malformed answer, leaves the inbox and the span fallback in charge.
		if !errors.Is(err, oxp.ErrEventPending) {
			log.Printf("flow component=policy-ce event=oxp_realtime trace_id=%s span_id=%s lookup=llm_span_events available=false err=%q", r.TraceId, r.SpanId, err)
		}
		return nil, realtimeNone, nil
	}
	var selected *currentEvent
	for _, event := range list {
		if event.Type != "llm.started" || event.TraceID != r.TraceId || event.SpanID != r.SpanId {
			continue
		}
		var envelope struct {
			Data struct {
				Input json.RawMessage `json:"input"`
			} `json:"data"`
		}
		if json.Unmarshal(event.Raw, &envelope) != nil {
			return nil, realtimeNone, errors.New("malformed llm.started event")
		}
		texts, definitionsKnown, ok := modelInput(envelope.Data.Input)
		if !ok {
			return nil, realtimeNone, errors.New("llm.started event has no valid model input")
		}
		sortTexts(texts)
		candidate := &currentEvent{session: event.SessionID, texts: texts, definitionsKnown: definitionsKnown, realtime: true, via: "llm.started of span " + r.SpanId}
		if selected != nil {
			return nil, realtimeNone, errors.New("more than one llm.started event for the submitted span")
		}
		selected = candidate
	}
	if selected == nil {
		return nil, realtimeNone, nil
	}
	return selected, realtimeFound, nil
}

// messageSentCandidate reads the content a message.sent event carries: the text parts of an A2A message or the
// arguments of an MCP tools/call. It returns nil, nil when the event has no usable content (older SDKs).
func (j *Judge) messageSentCandidate(r *cev1.EvaluateRequest, event oxp.RealtimeEvent) (*currentEvent, error) {
	want := "a2a.message.sent"
	if j.Kind == policy.EvidenceMCPToolInput {
		want = "mcp.message.sent"
	}
	if event.Type != want {
		return nil, fmt.Errorf("carrier event is %s, not %s", event.Type, want)
	}
	if event.TraceID != r.TraceId {
		return nil, errors.New("carrier event belongs to a different trace")
	}
	var envelope struct {
		Data struct {
			Input map[string]any `json:"input"`
		} `json:"data"`
	}
	if json.Unmarshal(event.Raw, &envelope) != nil {
		return nil, errors.New("malformed message.sent event")
	}
	input := envelope.Data.Input
	if len(input) == 0 {
		return nil, nil
	}
	var texts []evidence.Text
	collect := func(value any) {
		events.CollectStrings(value, func(text string) { texts = append(texts, evidence.Text{Role: evidence.RoleToolInput, Text: text}) })
	}
	if j.Kind == policy.EvidenceMCPToolInput {
		arguments, present := input["arguments"]
		if _, isObject := arguments.(map[string]any); !present || !isObject {
			return nil, nil
		}
		collect(arguments)
	} else {
		parts, present := input["parts"].([]any)
		if !present {
			return nil, nil
		}
		if id, _ := input["messageId"].(string); id != "" {
			if want := r.Extra["ioc.observe.message_id"]; want != "" && want != id {
				return nil, errors.New("carrier event belongs to a different message")
			}
		}
		collect(parts)
	}
	sortTexts(texts)
	return &currentEvent{session: event.SessionID, texts: texts, realtime: true}, nil
}

func sortTexts(texts []evidence.Text) {
	sort.Slice(texts, func(a, b int) bool {
		if texts[a].Role != texts[b].Role {
			return texts[a].Role < texts[b].Role
		}
		return texts[a].Text < texts[b].Text
	})
}
