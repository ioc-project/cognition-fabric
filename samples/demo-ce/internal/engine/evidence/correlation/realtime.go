package correlation

import (
	"context"
	"errors"
	"fmt"
	"log"
	"reflect"
	"sort"

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

// hasRealtimeRef reports whether the request names its pre-call event, for the kinds that have one.
func (j *Judge) hasRealtimeRef(r *cev1.EvaluateRequest) bool {
	return j.Client != nil && j.Kind != policy.EvidenceLLMInput && (r.Extra[ExtraPrecallEventID] != "" || r.Extra[ExtraEventID] != "")
}

// realtime resolves the pre-call tool.started event through the OXP realtime endpoints. The direct id wins;
// otherwise the span's tool.started events are searched for the one whose parent is the carrier's event.id.
// The returned error means the reference is contradictory (wrong trace, span or message, or ambiguous
// candidates), which is never retried. An endpoint failure is reported as realtimeNone.
func (j *Judge) realtime(ctx context.Context, r *cev1.EvaluateRequest) (*currentEvent, realtimeState, error) {
	if !j.hasRealtimeRef(r) {
		return nil, realtimeNone, nil
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
	sort.Slice(texts, func(a, b int) bool {
		if texts[a].Role != texts[b].Role {
			return texts[a].Role < texts[b].Role
		}
		return texts[a].Text < texts[b].Text
	})
	return &currentEvent{session: session, texts: texts, realtime: true}, nil
}

func realtimeCheck(out *cev1.EvaluateResponse, via string) {
	out.ChecksRun = append(out.ChecksRun, &cev1.CheckResult{CheckId: "OXP_REALTIME_EVENT", Passed: true, Reason: "pre-call input read from OXP realtime: " + via})
}
