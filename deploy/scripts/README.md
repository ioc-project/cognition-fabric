# `scripts/`

[`init-multi-db.sh`](init-multi-db.sh) runs automatically on the first init of
`ioc-scale-db` and creates the `cfn_mgmt`, `cognition_store`, and `cfn_audit`
databases.

[`ensure-databases.sh`](ensure-databases.sh) runs as one-shot service
`ioc-scale-db-init` on every `docker compose --env-file ../.env up`, ensuring those same databases
exist even when reusing an existing Postgres volume.

The rest of this page is the end-to-end run: app → ClickHouse → RabbitMQ →
Neo4j.

```
app --OTLP--> otel-collector --> ClickHouse.otel_traces
                                      |
                        mv_otel_traces_end (on session.end)
                                      v
                          otel_traces_end_rmq (RabbitMQ engine)
                                      v
                       claris exchange --> new_session_in queue
                                      v
                              norm --> Neo4j
```

The stack configures the ClickHouse-to-RabbitMQ path automatically. Two
one-shot services appear as `Exited (0)` after successful initialization:

- `scope-clickhouse-init` waits five seconds, polls for the collector-created
  `otel_traces` table, and applies [`init-scope-clickhouse.sql`](init-scope-clickhouse.sql).
- `scope-rabbitmq-init` waits for `norm` to declare `new_session_in`, then binds
  that queue to the `claris` exchange.

## 1. Start the stack

Run the stack commands below from `deploy/`, with the monorepo root `.env` configured.

```bash
set -a; source ../.env; set +a    # credentials for the commands below
docker compose --env-file ../.env --profile full-mas up -d
```

The profile adds the NOA trip planner, which needs `AI_GATEWAY_API_KEY` in
the root `.env` with the chat model on its allow-list. The remaining containers start
either way — leave the profile off if you are pointing your own instrumented
app at `http://localhost:4318` instead.

Having the app up now is fine — it starts tracing on its first request, not at
startup, so it emits nothing until step 4.

Wait until `ioc-scale-scope-clickhouse` and `ioc-scale-scope-rabbitmq` are healthy
and both initializer services have exited successfully. The workers restart a
few times while RabbitMQ comes up; that is expected.

The collector creates `default.otel_traces` on startup, so it is there as soon
as the stack is up — you do not need to send a span first.

Check initialization status:

```bash
docker compose --env-file ../.env ps -a scope-clickhouse-init scope-rabbitmq-init
docker compose --env-file ../.env logs scope-clickhouse-init scope-rabbitmq-init
```

Both scripts are idempotent. If either service fails because a dependency took
longer than its retry window, rerun them after the stack settles:

```bash
docker compose --env-file ../.env up scope-clickhouse-init scope-rabbitmq-init
```

## 2. Ask the app something

The wiring exists now, so this is the point where a session can make it all the
way through:

```bash
curl -X POST http://localhost:8125/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Plan a 1-day trip to Celestia"}'
```

Port 8125 rather than 8000, which belongs to `ioc-scale-cf-cognition-engine`.
`NOA_API_PORT` in the root `.env` moves the published port; the app always listens on
8125 inside the container.

**Then wait about five minutes.** The request returning is not the end of the
session. `ioa-observe-sdk` emits the `session.end` span — the one that triggers
the whole pipeline — from a background watcher, 5 minutes after the session's
last activity (`SESSION_IDLE_TIMEOUT_SECONDS = 300`, checked every 30s). Until
then the spans sit in ClickHouse and Neo4j stays empty, which is expected, not
a fault.

To flush it immediately instead, stop the app — its `atexit` handler emits the
span on the way out:

```bash
docker stop ioc-scale-noa-trip-planner
```

To run from a local checkout instead, skip the profile and start it by hand
from the repo's `samples/noa-trip-planner/`, with `OTLP_HTTP_ENDPOINT` set to
`http://localhost:4318`:

```bash
uv run --env-file .env python api.py
```

## 3. Verify

Walk the hops in order to see where it stopped.

Spans arrived:

```sql
SELECT Timestamp, session_id, ServiceName
FROM default.otel_traces
WHERE SpanName = 'session.end'
ORDER BY Timestamp DESC LIMIT 5;
```

Messages moved — `new_session_in` should have a consumer, and
`default_otel_traces_end_rmq` should not be piling up:

```bash
docker exec ioc-scale-scope-rabbitmq rabbitmqctl list_queues \
  name messages consumers
```

Worker picked it up — look for `Processing session_id:`, then `Normalized
run_id=... -> N nodes, M edges`, then `Neo4j push complete`:

```bash
docker logs ioc-scale-scope-norm --tail 20
```

Graph populated:

```bash
docker exec ioc-scale-scope-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
  "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC;"
```

Or browse <http://localhost:7474>:

```cypher
MATCH (s:Session)
OPTIONAL MATCH (ac:AgentCall {sessionId: s.sessionId})
RETURN s.sessionId, s.appName, s.inputQuery,
       (max(ac.endTime) - min(ac.startTime)) AS durationSeconds;

// what ran, in order
MATCH (ac:AgentCall)
RETURN ac.agentName AS agent, ac.status AS status, ac.startTime AS started
ORDER BY started;

// what kind of work happened
MATCH (t:Transition)
RETURN t.actionType AS actionType, count(*) AS c ORDER BY c DESC;

MATCH (a:Agent) RETURN a.agentId, a.canonicalId;
MATCH (t:Tool) RETURN t.name;

// full session trace — state, transition, next state
MATCH path = (st:State)-[:inputTo]->(t:Transition {sessionId: "<id>"})
             -[:leadsTo]->(st2:State)
RETURN path LIMIT 50;

// what performed what (agents / tools / LLMs / processing)
MATCH (t:Transition {sessionId: "<id>"})-[:realizes]->(e)
RETURN t.layer, t.actionType, labels(e), e LIMIT 50;

// agent-level view: input state, agent, output state
MATCH (t:Transition {sessionId: "<id>"})-[:realizes]->(ac:AgentCall)
MATCH (from:State)-[:inputTo]->(t)
OPTIONAL MATCH (t)-[:leadsTo]->(to:State)
RETURN from.content, ac.agentName, to.content
ORDER BY ac.startTime;
```

Names here differ from the snippet that circulates for this schema, which
silently returns nothing. The real ones:

| circulated          | actual                                  |
| ------------------- | --------------------------------------- |
| `:representsExecution` | `:realizes`                          |
| `:hasState`         | `:hasInitialState` / `:hasFinalState`   |
| `t.hierarchyLevel`  | `t.layer`                               |
| `t.transitionType`  | `t.actionType`                          |
| `a.name` on `Agent` | `a.agentId`                             |
| `s.duration`        | no such property — see below            |

`:inputTo` and `:leadsTo` are real. Dump the schema rather than guessing:

```cypher
MATCH (a)-[r]->(b)
RETURN labels(a)[0], type(r), labels(b)[0], count(*) ORDER BY count(*) DESC;

MATCH (ac:AgentCall) RETURN keys(ac) LIMIT 1;
```

`Session` has no `duration`, and do not derive one from its own `startTime` /
`endTime` — those are copied from the first agent call, not the whole session,
so they under-report badly (2.3s against a 25s run). The query above spans the
agent calls instead, which matches the `LangGraph.workflow` span in ClickHouse:

```sql
SELECT SpanName, Duration / 1e9 AS seconds
FROM default.otel_traces
WHERE session_id = '<id>' AND SpanName = 'LangGraph.workflow';
```

Also note `finalize_on_error` appears in the agent list on every run, including
successful ones. The sample app calls that traced wrapper unconditionally after
the graph completes; it does not mean the run failed.

## Replaying

If a session ran while step 2 or step 3 was missing, it was never delivered —
but the spans are still in ClickHouse. The easy way to end up here is calling
`/ask` before finishing steps 2 and 3. Fix the missing piece, then republish
instead of re-running the app:

```sql
INSERT INTO default.otel_traces_end_rmq
SELECT session_id FROM default.otel_traces WHERE SpanName = 'session.end';
```

Bindings only affect future routing, so anything already stranded in
`default_otel_traces_end_rmq` stays there. The replay is what delivers it.

## Troubleshooting

**Neo4j empty but ClickHouse has spans** — first check whether the session has
a `session.end` span yet. Without one, nothing has been published and there is
nothing wrong:

```sql
SELECT session_id, count() AS spans, countIf(SpanName = 'session.end') AS ends
FROM default.otel_traces GROUP BY session_id;
```

If `ends` is 0, wait out the 5-minute idle timeout from step 4. If it is 1 and
Neo4j is still empty, a manual step is missing — check `mv_otel_traces_end`
exists (step 2), check the `claris` binding (step 3), then replay.

**`norm` logs `Fetched 1 spans` and `0 nodes, 0 edges`** — it processed a
session whose only span is the `session.end` itself, usually left over from an
earlier run whose other spans were lost. Harmless; check the span counts per
session with the query above to find the real one.

**`Code: 620 ... Direct select is not allowed`** — you ran `SELECT * FROM
otel_traces_end_rmq`. That is a live queue consumer, not storage; selecting
pops messages off the queue and discards them, stealing work from `norm`. Query
`otel_traces` instead.

**`Code: 47 ... Unknown identifier 'span_name'`** — case. It is `SpanName`.
Collector columns are CamelCase; the three added in step 2 are snake_case
because that is what the workers read. `DESCRIBE TABLE otel_traces` for the
full list.

**`Code: 57 ... already exists`** or **`Code: 524 ...
ALTER_OF_COLUMN_IS_FORBIDDEN`** — older copy of the block. Both `DROP TABLE`
statements must be present and above the `ALTER`s.

**`application_id` / `agent_id` empty** — harmless. Not every app emits those
attributes; only `session_id` matters here.

**No spans at all after calling `/ask`** — check the app itself:

```bash
docker logs ioc-scale-noa-trip-planner --tail 30
```

A missing or unauthorised `AI_GATEWAY_API_KEY` fails the request before any
span is emitted. `docker compose --env-file ../.env down` also leaves this container running,
since it is profiled — use `docker compose --env-file ../.env --profile full-mas down`.
