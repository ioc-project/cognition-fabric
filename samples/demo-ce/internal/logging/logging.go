// Package logging configures the demo console and carries request correlation through OXP calls.
package logging

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"

	cev1 "github.com/cisco-eti/ioc-scale-cfn-svc/pkg/api/ce/v1"
	"github.com/lmittmann/tint"
)

func New(w io.Writer, format, level string, noColor bool) (*slog.Logger, error) {
	var severity slog.Level
	if level == "" {
		level = "info"
	}
	if err := severity.UnmarshalText([]byte(level)); err != nil {
		return nil, fmt.Errorf("LOG_LEVEL: %w", err)
	}
	var handler slog.Handler
	switch format {
	case "", "console":
		handler = tint.NewTextHandler(w, &tint.Options{Level: severity, NoColor: noColor, TimeFormat: "15:04:05.000", ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if noColor {
				return a
			}
			switch a.Key {
			case "outcome":
				switch a.Value.String() {
				case "ALLOW":
					return tint.Attr(10, a)
				case "DENY":
					return tint.Attr(9, a)
				}
			case "stage":
				return tint.Attr(14, a)
			}
			return a
		}})
	case "json":
		handler = slog.NewJSONHandler(w, &slog.HandlerOptions{Level: severity})
	default:
		return nil, fmt.Errorf("LOG_FORMAT must be console or json")
	}
	return slog.New(handler).With("component", "demo-ce"), nil
}

type contextKey struct{}

func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(contextKey{}).(*slog.Logger); ok {
		return logger
	}
	return slog.Default()
}

func WithRequest(ctx context.Context, r *cev1.EvaluateRequest) context.Context {
	logger := FromContext(ctx)
	if r != nil {
		logger = logger.With("trace_id", r.TraceId, "span_id", r.SpanId, "mas_id", r.MasId, "source_agent_id", r.SourceAgentId, "destination_agent_id", r.DestinationAgentId)
	}
	return context.WithValue(ctx, contextKey{}, logger)
}

func Outcome(out *cev1.EvaluateResponse) string {
	return strings.TrimPrefix(out.Outcome.String(), "DECISION_")
}
