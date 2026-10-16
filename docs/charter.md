# Team Charter — CF (Cognition Fabric) T3

# Problem Statement

Multi-agent systems generate rich cognitive signals — traces, trajectories, findings — but the
fabric that sits between those signals and the CEs that act on them is not yet fit for purpose.
The current Cognition Fabric lacks structured Active and Enforcing API surfaces,
and the CE routing and chaining capability that Cognition Engines need to reliably compose and
enforce. The result: CEs like CASA and Detective can observe and report,
but have no clean, layered way to read shared context, trigger on L9 events, or enforce outcomes
through the fabric.

Enforcement in particular requires more than an API — it requires a component physically
in-the-middle of live agent interactions, able to block or modify before a message or tool call
takes effect. That component is the Enforcement Proxy; CF is the contract it enforces against.
Neither can deliver governance without the other.

The people carrying this gap are CE authors and platform engineers who need a stable,
well-specified runtime to build governance and scaling capabilities on — and today must work
around an under-specified, fragmented substrate. CF closes that gap.

## Alignment

* **BHAG:** Internet of Cognition (IoC).

* **Area:** Cognition Fabric for Scaling — shared with the **Enforcement Proxy** T3 (the
  in-path enforcement vehicle) and the **OXP** T3 (cognitive observability, integration &
  enrichment). All three are co-dependent nodes of the same fabric.

* **T3:** CF — Darren Lau (Lead), Chidumga Izuzu, Samuel Yang, Shridhar Shah. See
  [`team-assignments.md`](tome://team-assignments.md).

* **Window:** **Market Making (9+ months).** CF is foundational fabric infrastructure. Its value
  is unlocked by the governance and scaling CEs built on top of it, not a near-term serving
  deliverable.

CF owns the **fabric runtime** — the two-tier API surface (Active and Enforcing), CE routing and
chaining, and the L9 interaction plane. The Enforcement Proxy depends on CF's Enforcing API contracts
to become real; OXP integration is CF's key upstream work item, bringing trajectories and cognitive
enrichment into the fabric as first-class signals. Analytics APIs and the Cognition Store are owned
by the OXP team. CF defines the contracts that peer T3s build against.

## Scope, Assumptions & Boundaries

**In scope**

* **OXP core integration** — refactor CF to integrate OXP as the primary source of traces, reconstructed trajectories, and semantic metrics; CE authors do not build separate ingestion pipelines.

* **Two-tier CF API surface** — Active (direct MAS engagement) and Enforcing (block / modify / inject via Enforcement Proxy in-path). Analytics APIs are owned by OXP.

* **CE support** — routing and chaining of CEs, including OXP CEs, across the fabric.

* **L9 interaction with MAS** — active (Active APIs) and enforcing modes.

**Out of scope**

* **In-path enforcement execution** — the sidecar, Envoy/Cilium filters, and `Disposition` application belong to the Enforcement Proxy T3. CF specifies the contract; the proxy executes it.

* **Authoring Cognition Engines** — CASA, Security Detections, Detective, and GATS CEs are built by their own teams.

* **L9 message schema** — owned by the L9 T3; CF mediates without owning the schema.

**Assumptions & boundaries**

* The Enforcing CF API contract is CF's to specify, co-reviewed with the Enforcement Proxy T3 and CE teams.

* The Cognition Store is owned by OXP.

* CF's guarantees cover traffic and CE interactions that flow through it; bypassing CF is out of scope to prevent.

## Ideal Customer Profile (ICP)

**Target personas**

* **CE authors (COGS, GATS CEs)** — teams building Cognition Engines that need a stable,
  well-specified fabric API to query context, trigger L9 actions, and enforce outcomes.

* **IoC Area and BHAG leads** — need CF to be the programmable backbone that makes the
  Enforcing tier real and GATS governance possible.

**Current market understanding**

MAS deployments are moving from single-owner prototypes to composed, cross-vendor systems.
Governance and safety capabilities are increasingly expected at the infrastructure layer rather
than inside individual agents. CF is the runtime that makes infrastructure-layer governance
possible in the IoC architecture.

**Use cases**

* **Analytics tier (OXP-owned):** A Security Detections CE or CASA queries OXP's Analytics APIs directly to read reconstructed trajectories and MAS metrics — no in-path requirement, pure detection and reporting.

* **Active tier:** A fact-checking CE or Detective Agent's Interrogation CE engages directly with the MAS through CF's Active APIs — querying tools, sending messages — without blocking any in-flight interaction.

* **Enforcing tier:** A GATS CE reads prior findings from the Cognition Store (via OXP), evaluates an in-flight L9 interaction, and issues an enforce disposition through CF's Enforcing APIs; the Enforcement Proxy applies it in-path (block / modify / inject).

* **L9 trigger from CEs:** An OXP CE fires an L9 trigger through CF to initiate a corrective agent action based on a reconstructed trajectory anomaly.

* **CE chaining:** A COGS CE chains through CF's routing layer to compose a multi-CE judgment — pulling findings from the Cognition Store — before returning a disposition.

**Customer research insights**

TBD — design-partner engagement not yet captured.

## Goals

The state of the world that means this effort has won:

1. **The Cognition Store is live (OXP-owned).** All CEs can publish findings and consume findings from other CEs through OXP's stable, queryable store; COGS and GATS CEs are the initial consumers.
2. **The two-tier API surface is specified and implemented.** Active and Enforcing APIs are each clearly bounded, documented, and exercised by at least one CE. Analytics APIs are owned and served by OXP.
3. **CE routing and chaining works.** CEs can be composed and sequenced through the fabric; L9
   triggers from CEs — including OXP CEs — reach their targets.
4. **The Enforcement tier is unblocked.** The Enforcement API contract is specified and the
   Enforcement Proxy T3 can implement against it; GATS enforces rather than reports.
5. **OXP is integrated.** CF consumes OXP trajectories and cognitive enrichment as first-class
   fabric signals, with no duplicated ingestion or reconstruction logic.

## Blast Radius

CF is foundational infrastructure for the entire Cognition Fabric for Scaling area. Changes to
the API surface or the Cognition Store schema affect every CE team and the Enforcement Proxy T3
simultaneously.

**If it succeeds:** IoC gains a programmable fabric runtime. GATS and COGS CEs compose, chain,
and enforce through a stable substrate. The Enforcing tier becomes real.

**If it fails or is wrong:**

1. **A wrong Enforcing API contract** propagates into the Enforcement Proxy's implementation
   and every CE that programs against it — a late discovery here is expensive across multiple T3s.
2. **A broken CE routing layer** silently drops or misroutes CE chains, producing incorrect
   governance outcomes without a visible failure signal.
3. **An unstable Cognition Store** (owned by OXP) means CEs cannot trust the findings they read, undermining the
   entire governance stack built on top of CF.

API contract stability and CE routing correctness are therefore first-order concerns.
