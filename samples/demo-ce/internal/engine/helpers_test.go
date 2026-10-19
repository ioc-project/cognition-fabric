package engine

import "github.com/cisco-eti/ioc-scale-cf-demo-ce/policy-ce/internal/inbox"

const (
	trace = "0123456789abcdef0123456789abcdef"
	span  = "0123456789abcdef"
)

// testEngine is a contentEngine with the inbox its event evidence reads, so tests can publish events.
type testEngine struct {
	*contentEngine
	events *inbox.Inbox
}
