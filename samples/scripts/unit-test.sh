#!/bin/bash -e

# Run CASA CE unit tests
cd engines/casa
uv pip install -e ".[test]"
uv run pytest -v
echo "UNIT-TEST DONE"