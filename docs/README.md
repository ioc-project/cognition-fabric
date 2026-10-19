# docs/

Canonical Cognition Fabric project documentation in `ioc-scale-cfn-svc`. **Start with
[`charter.md`](charter.md)**, then [`architecture.md`](architecture.md).

This set follows the org TOME template list. Each file notes its category:

- **stable** — human-owned commitments that change deliberately
- **source** — canonical project explanation or specification
- **generated** — an index/view assembled from Beads or ADR files, not maintained by hand
- **source + generated** — a file that owns one canonical section and delegates live state to a
  generated view

## Required templates

| Document | Category | What it is |
|----------|----------|------------|
| [`charter.md`](charter.md) | stable | The problem, why now, alignment, scope, ICP, goals, and KPIs. **The highest-value document here.** |
| [`roadmap.md`](roadmap.md) | generated | Epic-only roadmap snapshot. |
| [`architecture.md`](architecture.md) | source | Releases 1–3 architecture of record. |
| [`discussions/`](discussions/README.md) | generated | Open questions and discussions. |
| [`team-assignments.md`](team-assignments.md) | stable | Roster, leadership and decision responsibility, advisors, partner engagement owners. |
| [`dependencies.md`](dependencies.md) | source + generated | Project-level dependency edges. |
| [`issues.md`](issues.md) | generated | Issues, risks, and disagreements. |
| [`status.md`](status.md) | generated | Current health, risks, open decisions, and ready work. |
| [`actions.md`](actions.md) | generated | Clean next-task snapshot. |
| [`decision-log.md`](decision-log.md) | generated | Snapshot of decisions and discussions; consult ADRs for accepted CFN decisions. |

## Supporting documents

| Document | What it is |
|----------|------------|
| [`glossary.md`](glossary.md) | Source definitions, one `##` heading per term. **Start here if a term is unfamiliar.** |
| [`target-architecture.md`](target-architecture.md) | Longer-term CF target; distinguish it from the Releases 1–3 architecture. |
| [`agent-ledger/`](agent-ledger/README.md) | Agent working guidance, separate from curated ADRs. |
| [`plans/`](plans/local-cf-source-workflow.plan.md) | Historical CF implementation plans. |
| [`decisions/`](decisions/README.md) | Curated, numbered CFN architecture decision records. |
| [`specs/`](specs/README.md) | Behavioural specs and API contracts. |

## Related sources of truth

- [`../README.md`](../README.md) — concise project overview and current maturity.

## Conventions

- **Generated views are not records.** Update Beads or ADR files, then regenerate the view.
- **A settled discussion becomes an ADR.** Write `decisions/NNNN-title.md`, then close the discussion.
