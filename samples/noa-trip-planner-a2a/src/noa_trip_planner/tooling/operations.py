# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Transport-neutral trip-planner tool operations."""

import ast
import math
import operator
import pickle
from pathlib import Path

import networkx as nx

from noa_trip_planner.delay import apply_simulated_delay


DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
DOCUMENT_ROOT = DATA_ROOT / "documents"
GRAPH_FILE = DATA_ROOT / "graphs" / "city_graph.gpickle"
DOCUMENT_COLLECTIONS = frozenset({"schedule_agent", "concierge_agent"})


def _collection_directory(collection: str) -> Path:
    if collection not in DOCUMENT_COLLECTIONS:
        raise ValueError(f"Unknown document collection: {collection}")
    return DOCUMENT_ROOT / collection


def list_documents(collection: str) -> list[str]:
    """Return document names available to an agent collection."""
    apply_simulated_delay(component="tool", step_name="list_documents")
    directory = _collection_directory(collection)
    if not directory.is_dir():
        raise FileNotFoundError(f"Document collection not found: {collection}")
    return sorted(path.name for path in directory.iterdir() if path.is_file())


def read_document(collection: str, document_name: str) -> str:
    """Read a text document confined to an agent collection."""
    apply_simulated_delay(component="tool", step_name="read_document")
    if Path(document_name).name != document_name or not document_name.endswith(".txt"):
        raise ValueError("document_name must be a .txt file name without a path")

    directory = _collection_directory(collection).resolve()
    document = (directory / document_name).resolve()
    if document.parent != directory:
        raise ValueError("Document path escapes its collection")
    if not document.is_file():
        raise FileNotFoundError(f"Document not found: {document_name}")
    return document.read_text(encoding="utf-8")


def query_graph_database() -> str:
    """Return all possible routes and travel times from the city graph."""
    apply_simulated_delay(component="tool", step_name="query_graph_database")
    with GRAPH_FILE.open("rb") as graph_handle:
        graph = pickle.load(graph_handle)

    all_paths: list[dict[str, object]] = []
    nodes = list(graph.nodes())
    for source in nodes:
        for target in nodes:
            if source == target:
                continue
            for path in nx.all_simple_paths(graph, source, target):
                total_weight = 0
                segments: list[str] = []
                for index in range(len(path) - 1):
                    edge_data = graph.get_edge_data(path[index], path[index + 1])
                    weight = edge_data.get("weight", 0) if edge_data else 0
                    total_weight += weight
                    segments.append(f"{path[index]} -> {path[index + 1]} ({weight}h)")
                all_paths.append(
                    {
                        "path": " -> ".join(path),
                        "segments": segments,
                        "total_time": total_weight,
                    }
                )

    lines = [
        "City Graph Information:",
        f"Nodes: {', '.join(nodes)}",
        f"Edges: {list(graph.edges(data=True))}",
        "",
        f"All Possible Paths (Total: {len(all_paths)}):",
        "",
    ]
    for index, path_info in enumerate(all_paths, 1):
        lines.extend(
            [
                f"{index}. Path: {path_info['path']}",
                f"   Segments: {' -> '.join(path_info['segments'])}",
                f"   Total Travel Time: {path_info['total_time']} hours",
                "",
            ]
        )
    return "\n".join(lines)


def calculate(expression: str) -> str:
    """Evaluate a restricted arithmetic expression."""
    apply_simulated_delay(component="tool", step_name="calculate")
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    functions = {
        "sqrt": math.sqrt,
        "pow": math.pow,
        "abs": abs,
        "round": round,
        "floor": math.floor,
        "ceil": math.ceil,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "log": math.log,
        "log10": math.log10,
        "exp": math.exp,
    }

    def evaluate(node: ast.AST) -> int | float:
        if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in operators:
            return operators[type(node.op)](evaluate(node.left), evaluate(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in operators:
            return operators[type(node.op)](evaluate(node.operand))
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in functions
        ):
            return functions[node.func.id](
                *(evaluate(argument) for argument in node.args)
            )
        raise ValueError(f"Unsupported operation: {type(node).__name__}")

    try:
        return str(evaluate(ast.parse(expression, mode="eval").body))
    except (SyntaxError, TypeError, ValueError, ZeroDivisionError) as error:
        raise ValueError(f"Invalid calculation: {error}") from error
