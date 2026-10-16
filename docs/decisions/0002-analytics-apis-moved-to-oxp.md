# 0002 — Analytics APIs moved from CF to OXP

**Status:** Accepted

## Context

The original CF architecture defined a three-tier API surface owned entirely by CF: Analytics (read-only observability), Active (direct MAS engagement), and Enforcing (block / modify / inject). Under this model, CF would have exposed OXP's trace and trajectory data to CEs through its own Analytics API layer.

## Decision

**Analytics APIs are owned and served directly by OXP, not CF.**

CEs that need read-only observability data (traces, trajectories, semantic metrics) consume OXP's Analytics APIs directly. CF's API surface is reduced to two tiers: **Active** and **Enforcing**.

## Rationale

* OXP already owns the underlying data (trace collection, trajectory reconstruction, semantic metrics). Having CF re-expose that data through a separate API layer adds an unnecessary indirection.
* Keeping Analytics in OXP reduces CF's surface area and makes ownership cleaner — OXP controls both the data and its API contract.
* CF's value is in active engagement (Active tier) and enforcement (Enforcing tier); pure observability is not CF's core concern.

## Consequences

* **CF owns two tiers:** Active APIs and Enforcing APIs only.
* **OXP owns Analytics APIs:** CEs like Security Detections and CASA (in detection mode) consume OXP directly.
* **CF's charter and roadmap updated** to reflect a two-tier surface.
* **D2** (Cognition Store & Analytics APIs requirements) remains open — the Analytics API contract is now OXP's to define, but CF and CE teams still need to provide input on what data CEs require.
* The [Enforcement Flow diagram](tome://architecture/enforcement-flow.md) has been updated to label the OXP participant as "Analytics APIs (OXP-owned)".
