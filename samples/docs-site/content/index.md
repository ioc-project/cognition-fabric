---
title: Cognition Engines
slug: /
---

# Build and explain a Cognition Engine

Run the Go demonstration engine, follow a decision from CFN to its persisted finding,
or start a new engine from the Python template.

| | Demo CE | Template CE |
|---|---|---|
| Purpose | Demonstrate configured identity and content checks | Starting point for implementing an engine |
| Implementation | Go | Python |
| Location | `demo-ce/` | `template-ce/` |
| Evaluation | Configured ALLOW / DENY decisions | Always-ALLOW stub |
| Context | OXP realtime, Observe inbox and session/span context | Cognition Store client; runtime analytics left for extension |
| Finding persistence | Required when Store is configured | Best effort in the template |
| Execution | Root Compose service or native Go | Standalone Python or its own Dockerfile |

## Choose your starting point

- **Present the demo:** [run Demo CE](demo-ce/quickstart.md), then follow the
  [recording walkthrough](demo-ce/walkthrough.md).
- **Understand a decision:** read the [evaluation flow](demo-ce/evaluation-flow.md)
  alongside the [log event reference](demo-ce/logs.md).
- **Build an engine:** [run Template CE](template-ce/quickstart.md), then
  [replace its stub](template-ce/development.md).

Both expose `ioc.ce.v1.CognitionEngine`, with `Evaluate` and `GetInfo` RPCs.
The Go service imports its contract from the CFN module. The Python template carries its
own proto and generated stubs; check compatibility before connecting an extended template to CFN.

This site documents these two engines. It links to the surrounding stack where needed;
its runtime and deployment guides remain in their own repositories.
