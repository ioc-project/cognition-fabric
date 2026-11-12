# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""
Run experiments testing agent coalitions on a set of questions.

This script:
1. Loads experiment configuration (coalitions to test)
2. Loads a list of questions
3. Runs each question with each coalition
4. Saves results including the communication chain (captured during execution)
"""

import json
from datetime import datetime
from pathlib import Path

from experiments.common import (
    error_record,
    load_experiment_config,
    load_questions,
    success_record,
)
from noa_trip_planner.multi_agent_system import ask_question


def run_experiment(
    config_file: str = "configs/all_coalitions.json",
    questions_file: str = "questions/questions.json",
    output_prefix: str = None,
    coalition_filter: str = None,
):
    """Run experiments and save results.

    Args:
        config_file: Path to coalition config
        questions_file: Path to questions config
        output_prefix: Custom prefix for output file (default: timestamp)
        coalition_filter: Only run specific coalition (e.g., 'all_agents')
    """
    # Load configs
    config = load_experiment_config(config_file, filter_coalition=coalition_filter)
    questions = load_questions(questions_file)

    # Prepare output
    if output_prefix is None:
        output_prefix = datetime.now().strftime("%Y%m%d_%H%M%S")

    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)
    results_file = results_dir / f"{output_prefix}_results.jsonl"

    coalitions = config["coalitions"]

    print(f"\n{'='*80}")
    print(f"Experiment: {config.get('experiment_name', 'unnamed')}")
    print(f"Questions: {len(questions)}")
    print(f"Coalitions: {len(coalitions)}")
    print(f"Total runs: {len(questions) * len(coalitions)}")
    print(f"Output: {results_file}")
    print(f"{'='*80}\n")

    # Run experiments
    total_runs = len(questions) * len(coalitions)
    current_run = 0

    with open(results_file, "w") as f:
        for q_idx, question in enumerate(questions, 1):
            for c_idx, coalition in enumerate(coalitions, 1):
                current_run += 1

                print(f"[{current_run}/{total_runs}] Q{q_idx} × {coalition['name']}")

                try:
                    # Run the question with this coalition
                    result = ask_question(
                        question=question,
                        thread_id=f"exp_{output_prefix}_q{q_idx}_c{c_idx}",
                        debugging=False,
                        annotation_mode=False,
                        available_agents=coalition["agents"],
                    )

                    result_record = success_record(
                        config, q_idx, question, coalition, result
                    )

                except Exception as e:
                    print(f"  ERROR: {e}")
                    result_record = error_record(config, q_idx, question, coalition, e)

                # Write result as JSONL
                f.write(json.dumps(result_record) + "\n")
                f.flush()

    print(f"\n{'='*80}")
    print(f"Experiment complete!")
    print(f"Results saved to: {results_file}")
    print(f"Total runs: {current_run}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run agent coalition experiments")
    parser.add_argument(
        "--config",
        type=str,
        default="configs/all_coalitions.json",
        help="Path to coalition configuration file",
    )
    parser.add_argument(
        "--questions",
        type=str,
        default="questions/questions.json",
        help="Path to questions file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file prefix (default: timestamp)",
    )
    parser.add_argument(
        "--coalition",
        type=str,
        default=None,
        help="Run only a specific coalition (e.g., 'all_agents')",
    )

    args = parser.parse_args()

    run_experiment(
        config_file=args.config,
        questions_file=args.questions,
        output_prefix=args.output,
        coalition_filter=args.coalition,
    )
