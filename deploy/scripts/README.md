# `scripts/`

[`init-multi-db.sh`](init-multi-db.sh) runs automatically on the first init of
`ioc-scale-db` and creates the `cfn_mgmt` and `cfn_cp` databases. Nothing to do.

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

Steps 2 and 3 are manual. The stack does not create them. Do both before
running the app, or the session will not reach Neo4j.

Both are temporary. Automating them is tracked in
[#11](https://github.com/cisco-eti/ioc-scale-cf-deployment/issues/11), and
running the sample app from its published image in
[#12](https://github.com/cisco-eti/ioc-scale-cf-deployment/issues/12). Those
steps will be removed from this page once they land.

## 1. Start the stack

```bash
set -a; source .env; set +a    # credentials for the commands below
docker compose up -d
```

Wait until `ioc-scale-oxp-clickhouse` and `ioc-scale-oxp-rabbitmq` are healthy.
The workers restart a few times while RabbitMQ comes up; that is expected.

The collector creates `default.otel_traces` on startup, so it is there as soon
as the stack is up — you do not need to send a span first.

## 2. Set up ClickHouse

Adds the columns the workers read, plus the view that publishes each finished
session to RabbitMQ.

```bash
docker exec -it ioc-scale-oxp-clickhouse clickhouse-client
```

```sql
DROP TABLE IF EXISTS default.mv_otel_traces_end;
DROP TABLE IF EXISTS default.otel_traces_end_rmq;

ALTER TABLE default.otel_traces DROP COLUMN IF EXISTS session_id;
ALTER TABLE default.otel_traces DROP COLUMN IF EXISTS application_id;
ALTER TABLE default.otel_traces DROP COLUMN IF EXISTS agent_id;

ALTER TABLE default.otel_traces
ADD COLUMN session_id String MATERIALIZED
    multiIf(
        position(SpanAttributes['session.id'], '_') > 0,
        substring(
            SpanAttributes['session.id'],
            position(SpanAttributes['session.id'], '_') + 1
        ),
        SpanAttributes['session.id']
    );

ALTER TABLE default.otel_traces
ADD COLUMN application_id String MATERIALIZED SpanAttributes['application_id'];

ALTER TABLE default.otel_traces
ADD COLUMN agent_id String MATERIALIZED SpanAttributes['agent_id'];

CREATE TABLE default.otel_traces_end_rmq
(
    session_id String
)
ENGINE = RabbitMQ
SETTINGS
    rabbitmq_host_port = 'host.docker.internal:5672',
    rabbitmq_username = 'guest',
    rabbitmq_password = 'guest',
    rabbitmq_vhost = '/',
    rabbitmq_exchange_name = 'claris',
    rabbitmq_exchange_type = 'direct',
    rabbitmq_routing_key_list = 'new_session_in',
    rabbitmq_format = 'JSONEachRow',
    rabbitmq_persistent = 1;

CREATE MATERIALIZED VIEW default.mv_otel_traces_end
TO default.otel_traces_end_rmq
AS
SELECT session_id
FROM default.otel_traces
WHERE SpanName = 'session.end';
```

The credentials must match `RABBITMQ_USER` / `RABBITMQ_PASSWORD` in `.env`.

The client stops at the first error, so a failure part way through leaves the
view uncreated and the pipeline silently dead. Check both rows come back:

```sql
SELECT name, engine FROM system.tables
WHERE database = 'default'
  AND name IN ('otel_traces_end_rmq', 'mv_otel_traces_end');
```

Safe to re-run. Lives in the `oxp_clickhouse_data` volume, so it survives
restarts — only redo it after `docker compose down -v`.

## 3. Bind the queue in RabbitMQ

Required — the pipeline cannot work without it.

The workers all publish through the default exchange with the routing key set
to the queue name, so `new_session_in` is bound only there. ClickHouse cannot
join that convention: its RabbitMQ engine always declares the exchange it is
configured with, and AMQP forbids declaring the default exchange
(`ACCESS_REFUSED`), so it must publish to a named one. A named exchange with no
binding routes nowhere — messages end up in ClickHouse's own bridge queue,
`default_otel_traces_end_rmq`, which nothing consumes. This binding is what
connects the two.

```bash
docker exec ioc-scale-oxp-rabbitmq rabbitmqadmin -u guest -p guest \
  declare binding \
  source=claris destination_type=queue destination=new_session_in \
  routing_key=new_session_in
```

This is broker runtime state, not volume state — redo it whenever the RabbitMQ
container is recreated.

## 4. Run the app

From `claris-sample-apps/noa-trip-planner/src/noa_trip_planner`:
change app port from 8000 to 8125, since it collides with docker stack containers.
```bash
uv run --env-file .env python api.py
```

In another shell, ask it something:

```bash
curl -X POST http://localhost:8125/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Plan a 1-day trip to Celestia"}'
```

The app sends spans to the collector at `OTLP_HTTP_ENDPOINT` in its `.env`
(`http://localhost:4318`).

**Then wait about five minutes.** The request returning is not the end of the
session. `ioa-observe-sdk` emits the `session.end` span — the one that triggers
the whole pipeline — from a background watcher, 5 minutes after the session's
last activity (`SESSION_IDLE_TIMEOUT_SECONDS = 300`, checked every 30s). Until
then the spans sit in ClickHouse and Neo4j stays empty, which is expected, not
a fault. Stopping the app flushes it immediately instead, via its `atexit`
handler.

## 5. Verify

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
docker exec ioc-scale-oxp-rabbitmq rabbitmqctl list_queues \
  name messages consumers
```

Worker picked it up — look for `Processing session_id:`, then `Normalized
run_id=... -> N nodes, M edges`, then `Neo4j push complete`:

```bash
docker logs ioc-scale-oxp-norm --tail 20
```

Graph populated:

```bash
docker exec ioc-scale-oxp-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" \
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
but the spans are still in ClickHouse. Fix the missing piece, then republish
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
