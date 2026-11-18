# Decisions (ADRs)

Tracked architecture decisions — the "why" behind the project's direction. Each decision is
a short, numbered Markdown file (a lightweight ADR). Superseding decisions reference the
ones they replace rather than editing history.

## How decisions are tracked

- One file per decision, numbered `NNNN-title.md`, with **Status**, **Context**,
  **Decision**, and **Consequences**.
- Topics still **under discussion** live in [`../discussions/`](../discussions/README.md) until
  resolved into an ADR.
- The combined pending-and-decided view is [`../decision-log.md`](../decision-log.md).

## Index

| #    | Decision                                                                                 | Status   |
| ---- | ---------------------------------------------------------------------------------------- | -------- |
| 0001 | [Persist application_id as masId on the MAS node in the KG](0001-persist-masid-in-kg.md) | Accepted |
| 0002 | [Analytics APIs moved from CF to OXP](0002-analytics-apis-moved-to-oxp.md)               | Accepted |
| 0003 | [Single CF source repository](0003-consolidate-cf-repositories.md) | Accepted |
| 0004 | [Include deployment assets in the CF monorepo](0004-include-deployment-in-monorepo.md) | Accepted |

## Template

Use this template when creating a new ADR:

```markdown
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by [NNNN](NNNN-title.md)

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```
