# Copyright 2026 Cisco Systems, Inc. and its affiliates
#
# SPDX-License-Identifier: Apache-2.0

"""Tools for the multi-agent system."""

import os
from functools import partial
from os.path import dirname, exists, isfile, join, normpath

from langchain_core.tools import tool
from noa_trip_planner.delay import apply_simulated_delay


def _list_documents_impl(data_subdir: str) -> str:
    """List all documents in a specific data directory.

    Args:
        data_subdir: Subdirectory under data/documents (e.g., 'schedule_agent', 'concierge_agent')
    """
    data_dir = normpath(join(dirname(__file__), "..", "data", "documents", data_subdir))

    # Check if directory exists
    if not exists(data_dir):
        return f"Directory '{data_dir}' not found."

    # Get list of documents with full paths
    try:
        documents = [
            normpath(join(data_dir, f))
            for f in os.listdir(data_dir)
            if isfile(join(data_dir, f))
        ]
        if not documents:
            return f"No documents found in '{data_dir}' directory."

        return f"Available documents: {', '.join(documents)}"
    except Exception as e:
        return f"Error listing documents: {str(e)}"


@tool
def read_document(file_path: str) -> str:
    """Read a .txt file and return its content.

    Args:
        file_path: Full absolute path to the file

    Returns:
        The content of the file as a string, or an error message if reading fails.
    """
    print("apply_simulated_delay for read_document tool")
    apply_simulated_delay(component="tool", step_name="read_document")
    print("applied_simulated_delay for read_document tool")

    try:
        # Check if file exists
        if not exists(file_path):
            return f"File '{file_path}' not found."

        # Check if it's a .txt file
        if not file_path.endswith(".txt"):
            return f"File '{file_path}' is not a .txt file."

        # Read and return the content
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        return content if content else f"File '{file_path}' is empty."

    except Exception as e:
        return f"Error reading file '{file_path}': {str(e)}"


def create_agent_tools(agent_name: str):
    """Create agent-specific list_documents tool with the appropriate data directory.

    Args:
        agent_name: Name of the agent (e.g., 'schedule_agent', 'concierge_agent')

    Returns:
        list_documents_tool for the specified agent
    """

    # Create wrapper function with proper __name__ attribute
    def list_documents() -> str:
        """List all documents in the agent's data directory."""
        apply_simulated_delay(component="tool", step_name="list_documents")
        return _list_documents_impl(data_subdir=agent_name)

    # Wrap with @tool decorator
    list_docs_tool = tool(list_documents)

    return list_docs_tool


@tool
def query_graph_database() -> str:
    """
    Query the city graph database to find all possible paths between cities.

    Loads the graph from the saved file and returns all possible paths
    with their total travel times (edge weights in hours).

    Returns:
        A formatted string listing all possible paths with their total travel times.
    """
    apply_simulated_delay(component="tool", step_name="query_graph_database")

    import pickle

    import networkx as nx

    # Load the graph
    graph_file = normpath(
        join(dirname(__file__), "..", "data", "graphs", "city_graph.gpickle")
    )

    try:
        with open(graph_file, "rb") as f:
            G = pickle.load(f)
    except FileNotFoundError:
        return (
            f"Graph file not found at {graph_file}. Please run create_graph.py first."
        )
    except Exception as e:
        return f"Error loading graph: {str(e)}"

    # Find all possible paths between all pairs of nodes
    all_paths = []
    nodes = list(G.nodes())

    for source in nodes:
        for target in nodes:
            if source != target:
                try:
                    # Find all simple paths between source and target
                    paths = list(nx.all_simple_paths(G, source, target))

                    for path in paths:
                        # Calculate total weight for this path
                        total_weight = 0
                        path_segments = []

                        for i in range(len(path) - 1):
                            edge_data = G.get_edge_data(path[i], path[i + 1])
                            weight = edge_data.get("weight", 0) if edge_data else 0
                            total_weight += weight
                            path_segments.append(
                                f"{path[i]} -> {path[i + 1]} ({weight}h)"
                            )

                        path_str = " -> ".join(path)
                        all_paths.append(
                            {
                                "path": path_str,
                                "segments": path_segments,
                                "total_time": total_weight,
                            }
                        )
                except nx.NetworkXNoPath:
                    continue

    # Format the results
    if not all_paths:
        return "No paths found in the graph."

    result = f"City Graph Information:\n"
    result += f"Nodes: {', '.join(nodes)}\n"
    result += f"Edges: {list(G.edges(data=True))}\n\n"
    result += f"All Possible Paths (Total: {len(all_paths)}):\n\n"

    for i, path_info in enumerate(all_paths, 1):
        result += f"{i}. Path: {path_info['path']}\n"
        result += f"   Segments: {' -> '.join(path_info['segments'])}\n"
        result += f"   Total Travel Time: {path_info['total_time']} hours\n\n"

    return result


@tool
def calculate(expression: str) -> str:
    """
    Perform mathematical calculations on the given expression.

    Supports basic arithmetic operations (+, -, *, /), parentheses, and common
    mathematical functions (sqrt, pow, abs, round).

    Args:
        expression: A mathematical expression as a string (e.g., "2 + 3 * 4", "sqrt(16)")

    Returns:
        The result of the calculation as a string, or an error message if calculation fails.

    Examples:
        "2 + 3" -> "5"
        "10 * (5 + 3)" -> "80"
        "sqrt(25)" -> "5.0"
    """
    apply_simulated_delay(component="tool", step_name="calculate")

    import ast
    import math
    import operator as op

    # Supported operators
    operators = {
        ast.Add: op.add,
        ast.Sub: op.sub,
        ast.Mult: op.mul,
        ast.Div: op.truediv,
        ast.Pow: op.pow,
        ast.USub: op.neg,
        ast.UAdd: op.pos,
    }

    # Supported functions
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

    def eval_expr(node):
        """Recursively evaluate an AST node."""
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            return operators[type(node.op)](eval_expr(node.left), eval_expr(node.right))
        elif isinstance(node, ast.UnaryOp):
            return operators[type(node.op)](eval_expr(node.operand))
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in functions:
                func = functions[node.func.id]
                args = [eval_expr(arg) for arg in node.args]
                return func(*args)
            else:
                raise ValueError(
                    f"Unsupported function: {node.func.id if isinstance(node.func, ast.Name) else 'unknown'}"
                )
        else:
            raise TypeError(f"Unsupported operation: {type(node).__name__}")

    try:
        # Parse the expression
        node = ast.parse(expression, mode="eval").body
        result = eval_expr(node)
        return str(result)
    except SyntaxError as e:
        return f"Syntax error in expression '{expression}': {str(e)}"
    except (ValueError, TypeError, ZeroDivisionError) as e:
        return f"Calculation error for '{expression}': {str(e)}"
    except Exception as e:
        return f"Unexpected error calculating '{expression}': {str(e)}"
