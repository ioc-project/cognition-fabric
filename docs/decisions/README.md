# CF decisions

This is the concise index of current, durable Cognition Fabric decisions across the
workspace repositories. Read `ioc-scale-cf-deployment/docs/architecture.md` first
for short-term system behavior, then open only decisions relevant to the task.
Service documents may also describe longer-term targets or open proposals.

## How decisions are tracked

- Record an agreed choice only when its rationale and consequences need a durable
  record beyond the architecture. Do not add an entry for every task or plan.
- Keep this index focused on current decisions. If it grows, group active entries
  by topic and link to topic indexes rather than loading every decision page.
- Give each decision a short numbered ADR with **Status**, **Context**,
  **Decision**, and **Consequences**. When a choice is replaced, mark the old ADR
  superseded, link it from the replacement, and keep only the current decision
  in the active index. Historical files and Git preserve the earlier rationale.
- Keep unresolved topics in [discussions](../discussions/README.md), not in the
  decision index. The [decision log](../decision-log.md) is a generated view;
  this index and its linked ADRs are the record to consult.

## Current decisions

| # | Decision | Status |
|---|----------|--------|
| 0001 | [Persist application_id as masId on the MAS node in the KG](0001-persist-masid-in-kg.md) | Accepted |

## Template

```markdown
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by [NNNN](NNNN-title.md)

## Context

What prompted this choice?

## Decision

What was agreed, and why?

## Consequences

What changes or becomes harder?
```
