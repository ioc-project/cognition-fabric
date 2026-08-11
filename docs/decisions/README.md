# Decisions (ADRs)

Tracked architecture decisions — the "why" behind the project's direction. Each decision is
a short, numbered Markdown file (a lightweight ADR). Superseding decisions reference the
ones they replace rather than editing history.

## How decisions are tracked

- One file per decision, numbered `NNNN-title.md`, with **Status**, **Context**,
  **Decision**, and **Consequences**.
- Topics still **under discussion** live in [`../discussions.md`](../discussions.md) until
  resolved into an ADR.
- The combined pending-and-decided view is [`../decision-log.md`](../decision-log.md).

## Index

| # | Decision | Status |
|---|----------|--------|
| — | *No decisions recorded yet* | — |

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
