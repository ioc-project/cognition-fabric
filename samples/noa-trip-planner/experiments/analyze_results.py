"""
Analyze experiment results.

This script loads JSONL results and provides basic analysis:
- Success rates per coalition
- Average message counts
- Communication chains per question and coalition
- Effective agent coalitions used
"""

import json
from collections import defaultdict
from pathlib import Path


def load_results(results_file: str):
    """Load results from JSONL file."""
    results = []
    with open(results_file, "r") as f:
        for line in f:
            results.append(json.loads(line))
    return results


def agent_abbrev(agent_name: str) -> str:
    """Convert agent name to abbreviation: schedule->S, concierge->C, itinerary->I."""
    mapping = {
        "schedule_agent": "S",
        "concierge_agent": "C",
        "itinerary_agent": "I",
        "moderator": "M",
    }
    return mapping.get(agent_name, agent_name[0].upper())


def format_communication_chain(chain: list) -> str:
    """Format communication chain with merged nodes.

    Converts: M -q-> S S -r-> M to: M -q-> S -r-> M
    by removing redundant node when to[i] == from[i+1].

    Args:
        chain: List of edge dicts with 'from', 'to', 'query'/'response' keys

    Returns:
        Formatted chain string or error message if chain cannot be merged
    """
    if not chain:
        return "empty"

    # Build list of edges with their types
    edges = []
    for edge in chain:
        from_agent = agent_abbrev(edge.get("from", "?"))
        to_agent = agent_abbrev(edge.get("to", "?"))

        if "query" in edge:
            edge_type = "q"
        elif "response" in edge:
            edge_type = "r"
        else:
            edge_type = "?"

        edges.append((from_agent, to_agent, edge_type))

    # Verify chain continuity and build output
    output = [edges[0][0]]  # Start with first "from" node

    for i, (from_node, to_node, edge_type) in enumerate(edges):
        # Verify continuity: current edge's "from" should match previous edge's "to"
        if i > 0:
            prev_to = edges[i - 1][1]
            if from_node != prev_to:
                return f"ERROR: Chain broken at position {i}: {prev_to} != {from_node}"

        # Add edge and destination node
        output.append(f" -{edge_type}-> {to_node}")

    return "".join(output)


def get_effective_coalition(chain: list) -> str:
    """Extract unique agents (excluding moderator) from chain.

    Returns abbreviated agent names in order of appearance.
    """
    agents = []
    seen = set()
    for edge in chain:
        for agent_field in ["from", "to"]:
            agent = edge.get(agent_field, "")
            if agent and agent != "moderator" and agent not in seen:
                abbrev = agent_abbrev(agent)
                agents.append(abbrev)
                seen.add(agent)

    return "".join(agents) if agents else "-"


def analyze_results(results_file: str):
    """Analyze experiment results."""
    results = load_results(results_file)

    print(f"Loaded {len(results)} results")
    print("=" * 80)

    # Group by coalition
    by_coalition = defaultdict(list)
    for result in results:
        by_coalition[result["coalition_name"]].append(result)

    # Coalition statistics
    print("\n📊 Coalition Performance:")
    print("-" * 80)

    for coalition_name, coalition_results in sorted(by_coalition.items()):
        total = len(coalition_results)
        success = sum(1 for r in coalition_results if r["status"] == "success")
        avg_messages = (
            sum(r["message_count"] for r in coalition_results) / total
            if total > 0
            else 0
        )

        print(f"\n{coalition_name}:")
        print(f"  Success rate: {success}/{total} ({100*success/total:.1f}%)")
        print(f"  Avg messages: {avg_messages:.1f}")

    # Question statistics with communication chains
    print("\n\n📝 Question Statistics:")
    print("-" * 80)

    by_question = defaultdict(list)
    for result in results:
        by_question[result["question_index"]].append(result)

    for q_idx, q_results in sorted(by_question.items()):
        question = q_results[0]["question"]
        success_count = sum(1 for r in q_results if r["status"] == "success")
        total_count = len(q_results)

        print(f"\nQ{q_idx}: {question}")
        print(f"  Success: {success_count}/{total_count} coalitions")
        print()

        # Per-coalition analysis
        for result in q_results:
            coalition = result["coalition_name"]
            status = result["status"]
            chain = result.get("communication_chain", [])

            chain_str = format_communication_chain(chain)
            effective = get_effective_coalition(chain)

            print(f"  Coalition: {coalition}")
            print(f"    Chain: {chain_str}")
            print(f"    Effective: {effective}")

    # Error analysis
    errors = [r for r in results if r["status"] == "error"]
    if errors:
        print("\n\n⚠️  Errors:")
        print("-" * 80)
        for error in errors:
            print(f"\nQ{error['question_index']} × {error['coalition_name']}")
            print(f"  Error: {error.get('error', 'Unknown')}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Analyze experiment results")
    parser.add_argument("results_file", type=str, help="Path to results JSONL file")

    args = parser.parse_args()

    analyze_results(args.results_file)
