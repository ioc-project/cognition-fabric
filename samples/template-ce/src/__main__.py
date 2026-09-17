"""Entry point for running CASA CE as a module."""
import os
import sys

# Add src directory to path so imports work
sys.path.insert(0, os.path.dirname(__file__))

from service import serve_async, DEFAULT_PORT
import asyncio
import logging

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    port = int(os.getenv("GRPC_PORT", DEFAULT_PORT))
    asyncio.run(serve_async(port))
