# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Helpers shared by the in-process and HTTP experiment runners (no app imports)."""

import json
from datetime import datetime
from pathlib import Path


def load_experiment_config(
    config_file: str = "configs/all_coalitions.json", filter_coalition: str = None
):
    """Load experiment configuration from JSON file.

    Args:
        config_file: Path to config file
        filter_coalition: If provided, only return this coalition (e.g., 'all_agents')
    """
    config_path = Path(__file__).parent / config_file
    with open(config_path, "r") as f:
        config = json.load(f)

    # Filter to specific coalition if requested
    if filter_coalition:
        config["coalitions"] = [
            c for c in config["coalitions"] if c["name"] == filter_coalition
        ]

    return config


def load_questions(questions_file: str = "questions/questions.json"):
    """Load questions from JSON file."""
    questions_path = Path(__file__).parent / questions_file
    with open(questions_path, "r") as f:
        questions = json.load(f)
    return questions


def success_record(config, q_idx, question, coalition, result):
    """Build the JSONL record for a successful run from an ask result dict."""
    communication_chain = result.get("communication_chain", [])
    return {
        "timestamp": datetime.now().isoformat(),
        "experiment_name": config["experiment_name"],
        "question_index": q_idx,
        "question": question,
        "coalition_name": coalition["name"],
        "coalition_agents": coalition["agents"],
        "session_id": result["session_id"],
        "final_answer": result["final_answer"],
        "message_count": len(result["messages"]),
        "communication_chain": communication_chain,
        "chain_length": len(communication_chain),
        "status": "success",
    }


def error_record(config, q_idx, question, coalition, error):
    """Build the JSONL record for a failed run."""
    return {
        "timestamp": datetime.now().isoformat(),
        "experiment_name": config["experiment_name"],
        "question_index": q_idx,
        "question": question,
        "coalition_name": coalition["name"],
        "coalition_agents": coalition["agents"],
        "session_id": None,
        "final_answer": None,
        "message_count": 0,
        "communication_chain": [],
        "chain_length": 0,
        "status": "error",
        "error": str(error),
    }
