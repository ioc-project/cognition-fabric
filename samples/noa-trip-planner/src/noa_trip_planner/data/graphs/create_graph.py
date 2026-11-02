"""
Script to create the city graph for the trip planner.
This graph represents the connections between cities with travel times.
"""

import pickle
from pathlib import Path
import logging

import networkx as nx


logger = logging.getLogger(__name__)

# Create a directed graph
G = nx.DiGraph()

# Add nodes (cities)
cities = ["Celestia", "Verdantia", "Luminos"]
G.add_nodes_from(cities)

# Add edges with weights (travel times in hours)
G.add_edge("Celestia", "Verdantia", weight=3)
G.add_edge("Verdantia", "Luminos", weight=2)

# Get the current directory (data/graphs)
graph_dir = Path(__file__).parent
graph_dir.mkdir(parents=True, exist_ok=True)

# Save the graph in the same directory
graph_file = graph_dir / "city_graph.gpickle"
with open(graph_file, "wb") as f:
    pickle.dump(G, f)

logger.info(f"Graph created and saved to: {graph_file}")
logger.info(f"Nodes: {list(G.nodes())}")
logger.info(f"Edges with weights: {list(G.edges(data=True))}")
logger.info(f"Edges with weights: {list(G.edges(data=True))}")