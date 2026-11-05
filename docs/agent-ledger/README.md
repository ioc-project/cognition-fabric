# CF agent ledger

This is shared working memory for agents planning, implementing, and reviewing changes
across the CF repositories. It records settled, non-obvious guidance that would prevent
a repeated mistake or a review concern that has already been considered and rejected.
It is not an architecture decision record or a substitute for a current contract.

Read the [CF architecture](../architecture.md) and [local workflow](../../deploy/README.md), then
consult this index and only notes relevant to the task. Use TOME and the local
agent notes for project-level architecture context. The curated CFN service
[ADRs](https://github.com/cisco-eti/ioc-scale-cfn-svc/tree/main/docs/decisions)
remain separate. If a note conflicts with current architecture, an applicable ADR,
or observed code, surface the conflict instead of silently following the note.

## Active guidance

- [CE evaluation response](ce-evaluation-response.md) — legacy binary compatibility,
  independent fixtures and bounded CE-specific audit JSON.
- [CFN disposition audit semantics](disposition-audit.md) — producer identity,
  resource associations, event types and processing success for issue #34.
- [Shared Proxy audit contract](proxy-audit.md) — minimal schema, contract ownership,
  canonical outcome filtering and the Proxy delivery boundary for issue #41.
- [CE endpoint ownership](ce-endpoint-ownership.md) — registration and reconnect ownership,
  unchanged HTTP health contract, and protection against stale probe results.
- [Local NOA enforcement modes](local-noa-enforcement.md) — source/proxy setup,
  configuration ownership, and the boundary between routing and content evidence.

## Maintaining the ledger

- Add or update a note only when the point is settled, supported by evidence, and
  likely to matter again. Do not add every task outcome, open question, or proposed
  architecture here.
- Give each note a narrow scope, the guidance, why it applies, links to the
  supporting discussion, PR, specification, ADR, or code, and a trigger for
  reconsidering it. Distinguish an agreed choice from an observation of current code.
- Index only guidance that still applies. Revise or remove stale guidance from the
  active index when the system changes; Git history retains earlier versions.
  Review ledger changes in the normal PR for the work that motivated them.
- Curated architecture decisions continue through the ADR process in the CFN
  service repository. An agent-ledger note neither creates nor supersedes an ADR.

A focused note can use this shape:

```markdown
# Short title

**Scope:** Component, release, or workflow where this applies.
**Guidance:** What an agent should do or avoid raising again.
**Why:** What was established, including any rejected alternative.
**Evidence:** Links to the source and its status.
**Revisit when:** The change that would make this guidance stale.
```
