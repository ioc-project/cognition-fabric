package engine

import "github.com/cisco-eti/ioc-scale-cf-demo-ce/demo-ce/internal/inbox"

const (
	trace     = "0123456789abcdef0123456789abcdef"
	span      = "0123456789abcdef"
	sessionID = "0001"
)

// testEngine is a contentEngine with the inbox its event evidence reads, so tests can publish events.
// It runs below the Router, so its responses keep the typed internal diagnostics; tests through
// the Router read the published details with diagnostics(t, out).
type testEngine struct {
	*contentEngine
	events *inbox.Inbox
}
