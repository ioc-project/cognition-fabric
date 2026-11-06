# CF local NOA experiments

These runners come from upstream `noa-trip-planner/` at `cc0c0f2` and use its
coalitions, questions, and JSONL result format. Run commands from
`deploy/local/noa-trip-planner`.

## Use the running local MAS

Start the CF stack and source NOA with the existing `task run:full-mas`
workflow. Its configured `NOA_MAS_ID` and `NOA_ENFORCEMENT_MODE` apply to every
experiment request. Then run:

```bash
uv run --frozen --group experiments -m experiments.run_experiment_http \
  --base-url http://localhost:8125 --coalition all_agents
```

`--base-url` defaults to `NOA_API_URL` or `http://localhost:8125`. Override it
when `NOA_API_PORT` is different. The HTTP runner does not load CFN's `.env` or
start a second MAS process. This keeps requests in the existing direct or
proxy enforcement setup.

`--coalition` selects a group from `configs/all_coalitions.json`; omit it to run
all eight groups, including moderator only. The API validates each selected
agent and keeps its tool enforcement enabled. Other options are `--config`,
`--questions`, `--output`, `--timeout`, and `--retries`. Requests are not retried
by default; explicitly enabling retries can repeat a question and its tool calls.

## Run in process

The upstream in-process runner is also included:

```bash
uv run --frozen -m experiments.run_experiment --coalition all_agents
```

It imports the CF-owned application and requires the same environment that the
source launcher normally provides, including `NOA_MAS_ID`, model credentials,
`OTLP_HTTP_ENDPOINT`, and the direct/proxy settings. It does not run the source
launcher's validation or start Envoy and the tool service. Prefer the HTTP
runner when testing an existing CF stack.

## Results and checks

Results are saved under the ignored `experiments/results/` directory. Each
record includes the coalition, question, session ID, final answer, message
count, communication chain, and success/error status. Session IDs can be used
to correlate OXP telemetry. Analyze a result file with:

```bash
uv run --frozen -m experiments.analyze_results \
  experiments/results/YYYYMMDD_HHMMSS_results.jsonl
```

Run the experiment and CF enforcement regression checks without model calls:

```bash
uv run --frozen --group dev python -m pytest tests -q
```
