# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Run experiments testing agent coalitions through the sample app's HTTP interface.

Same experiment as run_experiment.py (same config, questions and JSONL output),
but each question is sent to a running noa-trip-planner via POST /ask instead of
calling ask_question() in-process.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import httpx

from experiments.common import (
    DEFAULT_RESULTS_DIR,
    error_record,
    load_experiment_config,
    load_questions,
    success_record,
)

DEFAULT_BASE_URL = "http://localhost:8125"


def ask_http(client: httpx.Client, question, thread_id, agents, retries=0):
    """POST /ask and return the decoded JSON body; retry on transport errors."""
    payload = {
        "question": question,
        "thread_id": thread_id,
        "debugging": False,
        "available_agents": agents,
    }
    for attempt in range(retries + 1):
        try:
            resp = client.post("/ask", json=payload)
            resp.raise_for_status()
            return resp.json()
        except httpx.TransportError:
            if attempt == retries:
                raise


def run_experiment(
    base_url: str = DEFAULT_BASE_URL,
    config_file: str = "configs/all_coalitions.json",
    questions_file: str = "questions/questions.json",
    output_prefix: str = None,
    coalition_filter: str = None,
    timeout: float = 600.0,
    retries: int = 0,
    transport: httpx.BaseTransport = None,
    results_dir: Path = None,
) -> Path:
    """Run experiments against the HTTP API and save results. Returns results path."""
    config = load_experiment_config(config_file, filter_coalition=coalition_filter)
    questions = load_questions(questions_file)
    coalitions = config["coalitions"]

    if output_prefix is None:
        output_prefix = datetime.now().strftime("%Y%m%d_%H%M%S")

    results_dir = results_dir or DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    results_file = results_dir / f"{output_prefix}_results.jsonl"

    with httpx.Client(
        base_url=base_url.rstrip("/"), timeout=timeout, transport=transport
    ) as client:
        # Fail fast if the app is not reachable
        try:
            client.get("/health", timeout=10).raise_for_status()
        except httpx.HTTPError as e:
            raise SystemExit(f"Cannot reach noa-trip-planner at {base_url}: {e}")

        total_runs = len(questions) * len(coalitions)
        print(f"\n{'='*80}")
        print(f"Experiment: {config.get('experiment_name', 'unnamed')}")
        print(f"API: {base_url}")
        print(f"Questions: {len(questions)}")
        print(f"Coalitions: {len(coalitions)}")
        print(f"Total runs: {total_runs}")
        print(f"Output: {results_file}")
        print(f"{'='*80}\n")

        current_run = 0
        with open(results_file, "w") as f:
            for q_idx, question in enumerate(questions, 1):
                for c_idx, coalition in enumerate(coalitions, 1):
                    current_run += 1
                    print(f"[{current_run}/{total_runs}] Q{q_idx} × {coalition['name']}")
                    try:
                        result = ask_http(
                            client,
                            question,
                            f"exp_{output_prefix}_q{q_idx}_c{c_idx}",
                            coalition["agents"],
                            retries,
                        )
                        record = success_record(
                            config, q_idx, question, coalition, result
                        )
                    except (httpx.HTTPError, KeyError, ValueError) as e:
                        print(f"  ERROR: {e}")
                        record = error_record(config, q_idx, question, coalition, e)

                    f.write(json.dumps(record) + "\n")
                    f.flush()

    print(f"\n{'='*80}")
    print("Experiment complete!")
    print(f"Results saved to: {results_file}")
    print(f"Total runs: {current_run}")
    return results_file


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Run agent coalition experiments via the app's HTTP API"
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("NOA_API_URL", DEFAULT_BASE_URL),
        help=f"Base URL of the trip planner API (default: $NOA_API_URL or {DEFAULT_BASE_URL})",
    )
    parser.add_argument("--config", default="configs/all_coalitions.json")
    parser.add_argument("--questions", default="questions/questions.json")
    parser.add_argument("--output", default=None, help="Output file prefix")
    parser.add_argument("--coalition", default=None, help="Run only this coalition")
    parser.add_argument(
        "--timeout", type=float, default=600.0, help="Per-request timeout (seconds)"
    )
    parser.add_argument(
        "--retries", type=int, default=0, help="Retries on connection errors"
    )
    args = parser.parse_args(argv)

    run_experiment(
        base_url=args.base_url,
        config_file=args.config,
        questions_file=args.questions,
        output_prefix=args.output,
        coalition_filter=args.coalition,
        timeout=args.timeout,
        retries=args.retries,
    )


if __name__ == "__main__":
    sys.exit(main())
