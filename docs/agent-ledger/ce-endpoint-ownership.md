# CE endpoint ownership

**Scope:** CE registration, restart recovery, and management health monitoring.

**Guidance:** Follow the [CE lifecycle contract](../CE-LIFECYCLE.md#endpoint-ownership) for ownership,
migration, and compatibility rules. Keep reconnect intent explicit: the UI edit form sends unchanged
endpoint fields too. Preserve administrator enable/disable control independently of ownership.
Do not infer the latest registration from `created_at`, `updated_at`, or `last_seen`.

Regression coverage should include full UI form saves, unchanged reconnects, A-to-B-to-A restarts,
and health probes completing after ownership changes. Sparse PATCH bodies alone miss the UI case.

**Why:** A process at a reused address can answer for several historical registrations, and a UI save
can carry the same endpoint fields as a reconnect. Asynchronous probes can complete after either
operation, so request intent and probe generation both matter.

**Evidence:** [Issue #44](https://github.com/cisco-eti/ioc-scale-cfn-svc/issues/44),
[CE lifecycle contract](../CE-LIFECYCLE.md#endpoint-ownership), and
[management registration/monitoring](https://github.com/cisco-eti/ioc-scale-cf-mgmt-svc/blob/main/src/server/services/cognition_engine.py).

**Revisit when:** Multiple independently registered CEs intentionally share the same health or
enforcing service endpoint, or CE registration/reconnect semantics change.
